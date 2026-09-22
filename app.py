# ============================================================================
# ANNOTATED STUDY COPY
# THESE COMMENTS ARE INTENTIONALLY MORE DETAILED THAN NORMAL PRODUCTION CODE.
# THEY EXPLAIN EACH FUNCTION AND LOGICAL STATEMENT/BLOCK SO THE AUTHOR CAN
# REHEARSE THE DATA FLOW AND DESIGN DECISIONS BEFORE A TECHNICAL DISCUSSION.
# THE ORIGINAL SUBMISSION PACKAGE REMAINS UNCHANGED.
# ============================================================================


# IMPORT ANNOTATIONS FROM __FUTURE__ FOR THE OPERATIONS USED BELOW.
from __future__ import annotations

# IMPORT JSON FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import json
# IMPORT TIME FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import time
# IMPORT PATH FROM PATHLIB SO THE README CAN BE LOADED FOR THE IN-APP HELP VIEW.
from pathlib import Path
# IMPORT DATETIME, TIMEZONE FROM DATETIME FOR THE OPERATIONS USED BELOW.
from datetime import datetime, timezone
# IMPORT UUID4 FROM UUID FOR THE OPERATIONS USED BELOW.
from uuid import uuid4

# IMPORT FASTAPI, FILE, FORM, REQUEST, UPLOADFILE FROM FASTAPI FOR THE OPERATIONS USED BELOW.
from fastapi import FastAPI, File, Form, Request, UploadFile
# IMPORT HTMLRESPONSE, JSONRESPONSE, RESPONSE FROM FASTAPI.RESPONSES FOR THE OPERATIONS USED BELOW.
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse, Response
# IMPORT STATICFILES FROM FASTAPI.STATICFILES FOR THE OPERATIONS USED BELOW.
from fastapi.staticfiles import StaticFiles
# IMPORT JINJA2TEMPLATES FROM FASTAPI.TEMPLATING FOR THE OPERATIONS USED BELOW.
from fastapi.templating import Jinja2Templates
# IMPORT BASEMODEL FROM PYDANTIC FOR THE OPERATIONS USED BELOW.
from pydantic import BaseModel, Field
# IMPORT RUN_IN_THREADPOOL FROM STARLETTE.CONCURRENCY FOR THE OPERATIONS USED BELOW.
from starlette.concurrency import run_in_threadpool

# IMPORT EXTRACT_APPLICATION_PDF FROM APPLICATION_PARSER FOR THE OPERATIONS USED BELOW.
from application_parser import extract_application_pdf
# IMPORT ENGINE_OPTIONS, EXTRACT_LABEL FROM ENGINES FOR THE OPERATIONS USED BELOW.
from engines import ENGINE_OPTIONS, extract_label
# IMPORT MATCH_APPLICATION FROM MATCHING FOR THE OPERATIONS USED BELOW.
from matching import match_application
# IMPORT SYNTHESIZE_WAV FROM TTS FOR THE OPERATIONS USED BELOW.
from tts import synthesize_wav
# IMPORT VERIFICATION_WITHOUT_APPLICATION, VERIFY_LABEL FROM VALIDATION FOR THE OPERATIONS USED BELOW.
from validation import (
    verification_without_application,
    verify_label,
)
from reporting import (
    build_csv_report,
    build_pdf_report,
)


# SET `APP` FOR USE BY THE FOLLOWING PROCESSING STEPS.
app = FastAPI(
    title="AI-Powered Alcohol Label Verification Prototype"
)

# CALL `APP.MOUNT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
app.mount(
    "/static",
    StaticFiles(directory="static"),
    name="static",
)

# SET `TEMPLATES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
templates = Jinja2Templates(
    directory="templates"
)


# DEFINE AND VALIDATE THE JSON BODY ACCEPTED BY THE TEXT-TO-SPEECH ENDPOINT.
class SpeakRequest(BaseModel):
    # SET `TEXT` WITH AN EXPLICIT TYPE ANNOTATION FOR LATER USE.
    text: str


# DEFINE THE JSON BODY USED TO EXPORT THE CURRENT BATCH AS CSV OR PDF.
class ExportReportRequest(BaseModel):
    format: str
    generated_at: str | None = None
    summary: dict = Field(default_factory=dict)
    applications: list[dict] = Field(default_factory=list)
    items: list[dict] = Field(default_factory=list)


# CREATE A UNIQUE VERIFICATION RECEIPT NUMBER THAT ENCODES THE FINAL RESULT AND UTC DATE.
def create_receipt_number(status: str) -> str:
    # SET `STATUS_CODE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    status_code = {
        "PASS": "P",
        "FAIL": "F",
        "REVIEW": "R",
    }.get(status, "R")

    # SET `DATE_CODE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    date_code = datetime.now(
        timezone.utc
    ).strftime("%Y%m%d")

    # SET `UNIQUE_CODE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    unique_code = (
        uuid4()
        .hex[:8]
        .upper()
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return (
        f"VR-{status_code}-"
        f"{date_code}-"
        f"{unique_code}"
    )


# RENDER THE MAIN BROWSER INTERFACE AND PROVIDE THE AVAILABLE ANALYSIS ENGINES TO THE TEMPLATE.
@app.get(
    "/",
    response_class=HTMLResponse,
)
async def home(request: Request):
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "engine_options":
                ENGINE_OPTIONS
        },
    )


# RETURN THE PROJECT README AS PLAIN TEXT FOR THE IN-APP HELP MODAL.
@app.get(
    "/api/readme",
    response_class=PlainTextResponse,
)
async def readme_help():
    # RESOLVE README.MD RELATIVE TO THIS APPLICATION FILE SO THE ROUTE WORKS FROM THE PROJECT DIRECTORY.
    readme_path = Path(__file__).resolve().parent / "README.md"

    # RETURN A CONTROLLED MESSAGE IF THE DOCUMENTATION FILE IS NOT AVAILABLE.
    if not readme_path.exists():
        return PlainTextResponse(
            "README.md is not available in this build.",
            status_code=404,
        )

    # RETURN THE README CONTENT WITHOUT EXECUTING OR INTERPRETING MARKDOWN AS HTML.
    return PlainTextResponse(
        readme_path.read_text(encoding="utf-8")
    )


# ACCEPT ONE APPLICATION PDF, PARSE IT OFF THE EVENT LOOP, AND RETURN STRUCTURED APPLICATION FIELDS.
@app.post("/api/extract-application")
async def extract_application(
    application: UploadFile = File(...),
):
    # SET `STARTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    started = time.perf_counter()

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # SET `PDF_BYTES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        pdf_bytes = await application.read()

        # CHECK `NOT PDF_BYTES` AND TAKE THE APPROPRIATE BRANCH.
        if not pdf_bytes:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error":
                        "The uploaded application PDF is empty.",
                },
            )

        # SET `FILENAME` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        filename = (
            application.filename
            or
            "application.pdf"
        )

        # SET `EXTRACTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        extracted = await run_in_threadpool(
            extract_application_pdf,
            pdf_bytes,
            filename,
        )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return {
            "ok": True,
            "processing_seconds":
                round(
                    time.perf_counter()
                    -
                    started,
                    2,
                ),
            "application":
                extracted,
        }

    except Exception as exc:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(exc),
            },
        )


# RUN THE COMPLETE SINGLE-LABEL PIPELINE: EXTRACTION, APPLICATION MATCHING, VALIDATION, RECEIPT CREATION, AND JSON RESPONSE.
@app.post("/api/analyze-one")
async def analyze_one(
    engine: str = Form(...),
    applications_json: str = Form("[]"),
    label: UploadFile = File(...),
):
    # SET `STARTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    started = time.perf_counter()

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # SET `IMAGE_BYTES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        image_bytes = await label.read()

        # CHECK `NOT IMAGE_BYTES` AND TAKE THE APPROPRIATE BRANCH.
        if not image_bytes:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return JSONResponse(
                status_code=400,
                content={
                    "ok": False,
                    "error":
                        "The uploaded label image is empty.",
                },
            )

        # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
        try:
            # SET `APPLICATIONS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            applications = json.loads(
                applications_json
            )
        except json.JSONDecodeError as exc:
            # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
            raise ValueError(
                "Application metadata could not be read."
            ) from exc

        # CHECK `NOT ISINSTANCE(APPLICATIONS, LIST)` AND TAKE THE APPROPRIATE BRANCH.
        if not isinstance(
            applications,
            list,
        ):
            # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
            raise ValueError(
                "Application metadata must be a list."
            )

        # SET `FILENAME` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        filename = (
            label.filename
            or
            "label.jpg"
        )

        # VISION/OCR IS BLOCKING WORK; RUN IT OUTSIDE THE FASTAPI EVENT LOOP SO
        # PARALLEL WORKER REQUESTS CAN REMAIN ACTIVE.
        # SET `EXTRACTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        extracted = await run_in_threadpool(
            extract_label,
            image_bytes,
            engine,
            filename,
        )

        # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        match = match_application(
            extracted,
            applications,
        )

        # SET `MATCHED_APPLICATION` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        matched_application = match.get(
            "application"
        )

        # CHECK `MATCHED_APPLICATION AND MATCH['STATUS'] == 'MATCHED'` AND TAKE THE APPROPRIATE BRANCH.
        if (
            matched_application
            and
            match["status"]
            ==
            "MATCHED"
        ):
            # SET `VERIFICATION` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            verification = verify_label(
                extracted=extracted,
                application_brand=(
                    matched_application.get(
                        "brand_name"
                    )
                    or
                    ""
                ),
                application_abv=(
                    matched_application.get(
                        "abv"
                    )
                    or
                    ""
                ),
            )

        # CHECK `MATCHED_APPLICATION AND MATCH['STATUS'] == 'UNCERTAIN'` AND TAKE THE APPROPRIATE BRANCH.
        elif (
            matched_application
            and
            match["status"]
            ==
            "UNCERTAIN"
        ):
            # WE STILL EXPOSE THE LEADING CANDIDATE, BUT DO NOT SILENTLY TREAT
            # AN UNCERTAIN RECORD PAIRING AS AUTHORITATIVE COMPLIANCE INPUT.
            # SET `VERIFICATION` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            verification = (
                verification_without_application(
                    match_status="UNCERTAIN",
                    match_reason=match["reason"],
                )
            )

        else:
            # SET `VERIFICATION` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            verification = (
                verification_without_application(
                    match_status="UNMATCHED",
                    match_reason=match["reason"],
                )
            )

        # SET `RECEIPT_NUMBER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        receipt_number = (
            create_receipt_number(
                verification[
                    "overall_status"
                ]
            )
        )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return {
            "ok": True,
            "filename": filename,
            "engine": extracted.engine,
            "processing_seconds":
                round(
                    time.perf_counter()
                    -
                    started,
                    2,
                ),
            "receipt_number":
                receipt_number,
            "extracted":
                extracted.model_dump(),
            "application_match":
                match,
            "verification":
                verification,
        }

    except Exception as exc:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "filename":
                    label.filename
                    or
                    "uploaded-label",
                "engine":
                    engine,
                "processing_seconds":
                    round(
                        time.perf_counter()
                        -
                        started,
                        2,
                    ),
                "error": str(exc),
            },
        )


# EXPORT THE CURRENT BATCH SNAPSHOT AS A DOWNLOADABLE CSV OR PDF REPORT.
@app.post("/api/export-report")
async def export_report(
    request: ExportReportRequest,
):
    report_format = (
        request.format
        .strip()
        .lower()
    )

    if report_format not in {
        "csv",
        "pdf",
    }:
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error":
                    "Report format must be csv or pdf.",
            },
        )

    generated_at = (
        request.generated_at
        or
        datetime.now(
            timezone.utc
        ).isoformat()
    )

    timestamp = (
        datetime.now(
            timezone.utc
        )
        .strftime(
            "%Y%m%d-%H%M%S"
        )
    )

    try:
        if report_format == "csv":
            report_bytes = await run_in_threadpool(
                build_csv_report,
                request.summary,
                request.applications,
                request.items,
            )

            media_type = (
                "text/csv; charset=utf-8"
            )

        else:
            report_bytes = await run_in_threadpool(
                build_pdf_report,
                request.summary,
                request.applications,
                request.items,
                generated_at,
            )

            media_type = "application/pdf"

        filename = (
            "ttb-label-verification-report-"
            f"{timestamp}.{report_format}"
        )

        return Response(
            content=report_bytes,
            media_type=media_type,
            headers={
                "Cache-Control":
                    "no-store",
                "Content-Disposition":
                    f'attachment; filename="{filename}"',
            },
        )

    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error":
                    f"Could not create report: {exc}",
            },
        )


# CONVERT REQUESTED RESULT TEXT INTO WAV AUDIO WITHOUT BLOCKING THE FASTAPI EVENT LOOP.
@app.post("/api/speak")
async def speak(request: SpeakRequest):
    # SET `TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    text = request.text.strip()

    # CHECK `NOT TEXT` AND TAKE THE APPROPRIATE BRANCH.
    if not text:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error":
                    "No speech text was supplied.",
            },
        )

    # CHECK `LEN(TEXT) > 2000` AND TAKE THE APPROPRIATE BRANCH.
    if len(text) > 2000:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return JSONResponse(
            status_code=400,
            content={
                "ok": False,
                "error":
                    "Speech text is limited to 2,000 characters.",
            },
        )

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # SET `WAV_BYTES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        wav_bytes = await run_in_threadpool(
            synthesize_wav,
            text,
        )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition":
                    'inline; filename="announcement.wav"',
            },
        )

    except Exception as exc:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return JSONResponse(
            status_code=500,
            content={
                "ok": False,
                "error": str(exc),
            },
        )


# RETURN A LIGHTWEIGHT HEALTH RESPONSE THAT HOSTING PLATFORMS CAN USE TO CONFIRM THE SERVICE IS ALIVE.
@app.get("/api/health")
async def health():
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "ok": True
    }
