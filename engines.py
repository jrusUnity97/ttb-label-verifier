# ============================================================================
# ANNOTATED STUDY COPY
# THESE COMMENTS ARE INTENTIONALLY MORE DETAILED THAN NORMAL PRODUCTION CODE.
# THEY EXPLAIN EACH FUNCTION AND LOGICAL STATEMENT/BLOCK SO THE AUTHOR CAN
# REHEARSE THE DATA FLOW AND DESIGN DECISIONS BEFORE A TECHNICAL DISCUSSION.
# THE ORIGINAL SUBMISSION PACKAGE REMAINS UNCHANGED.
# ============================================================================


# IMPORT ANNOTATIONS FROM __FUTURE__ FOR THE OPERATIONS USED BELOW.
from __future__ import annotations

# IMPORT IO FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import io
# IMPORT BASE64 SO PRIVATE UPLOADS CAN BE SENT TO A HOSTED VISION ENDPOINT AS DATA URLS.
import base64
# IMPORT JSON SO HOSTED MODEL RESPONSES CAN BE PARSED INTO THE SHARED PYDANTIC SCHEMA.
import json
# IMPORT OS FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import os
# IMPORT RE FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import re
# IMPORT TEMPFILE FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import tempfile
# IMPORT SHUTIL SO THE APP CAN LOCATE TESSERACT THROUGH WINDOWS PATH.
import shutil
# IMPORT SEQUENCEMATCHER FROM DIFFLIB FOR THE OPERATIONS USED BELOW.
from difflib import SequenceMatcher
# IMPORT DICT, ITERABLE FROM TYPING FOR THE OPERATIONS USED BELOW.
from typing import Dict, Iterable

# IMPORT CV2 FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import cv2
# IMPORT NP FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import numpy as np
# IMPORT OLLAMA FOR LOCAL VISION INFERENCE.
import ollama
# IMPORT REQUESTS FOR HOSTED VISION INFERENCE WHEN AN OPENROUTER KEY IS CONFIGURED.
import requests
# IMPORT PYTESSERACT FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import pytesseract
# IMPORT IMAGE FROM PIL FOR THE OPERATIONS USED BELOW.
from PIL import Image
# IMPORT OUTPUT FROM PYTESSERACT FOR THE OPERATIONS USED BELOW.
from pytesseract import Output

# IMPORT LABELEXTRACTION FROM MODELS FOR THE OPERATIONS USED BELOW.
from models import LabelExtraction


# LOCATE TESSERACT WITHOUT REQUIRING THE USER TO MANUALLY EDIT THIS FILE.
def _find_tesseract_executable() -> str | None:
    # FIRST HONOR AN EXPLICIT ENVIRONMENT VARIABLE WHEN ONE IS PROVIDED.
    configured = os.environ.get("TESSERACT_CMD", "").strip()
    if configured and os.path.isfile(configured):
        return configured

    # NEXT USE THE NORMAL OPERATING-SYSTEM PATH LOOKUP.
    path_match = shutil.which("tesseract")
    if path_match:
        return path_match

    # FINALLY CHECK COMMON WINDOWS INSTALL LOCATIONS USED BY TESSERACT INSTALLERS.
    candidates = [
        os.path.join(
            os.environ.get("ProgramFiles", r"C:\Program Files"),
            "Tesseract-OCR",
            "tesseract.exe",
        ),
        os.path.join(
            os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)"),
            "Tesseract-OCR",
            "tesseract.exe",
        ),
        os.path.join(
            os.environ.get("LOCALAPPDATA", ""),
            "Programs",
            "Tesseract-OCR",
            "tesseract.exe",
        ),
    ]

    for candidate in candidates:
        if candidate and os.path.isfile(candidate):
            return candidate

    return None


# CONFIGURE PYTESSERACT WHEN A VALID EXECUTABLE CAN BE DISCOVERED.
def _configure_tesseract() -> str | None:
    executable = _find_tesseract_executable()
    if executable:
        pytesseract.pytesseract.tesseract_cmd = executable
    return executable


# RECHECK AT RUNTIME SO A NEW INSTALL CAN BE FOUND AFTER THE APP IS RESTARTED.
def _ensure_tesseract_available() -> str:
    executable = _configure_tesseract()
    if executable:
        return executable

    raise RuntimeError(
        "Tesseract OCR was not found. Install Tesseract or add tesseract.exe "
        "to PATH. The app also checks C:\\Program Files\\Tesseract-OCR "
        "and common per-user install locations automatically."
    )


# CONFIGURE TESSERACT ON MODULE LOAD WHEN IT IS ALREADY INSTALLED.
_configure_tesseract()


# SET `ENGINE_MODELS` WITH AN EXPLICIT TYPE ANNOTATION FOR LATER USE.
ENGINE_MODELS: Dict[str, str] = {
    "ollama_gemma3": "gemma3:4b",
    "ollama_qwen25vl": "qwen2.5vl:7b",
}

# HOSTED MODEL IDS DEFAULT TO OPENROUTER'S STANDARD PAID VISION ENDPOINTS.
# THEY CAN BE OVERRIDDEN IN RAILWAY WITHOUT CHANGING SOURCE CODE.
HOSTED_ENGINE_MODELS: Dict[str, str] = {
    "ollama_gemma3": os.environ.get(
        "OPENROUTER_GEMMA_MODEL",
        "google/gemma-3-4b-it",
    ),
    "ollama_qwen25vl": os.environ.get(
        "OPENROUTER_QWEN_MODEL",
        "qwen/qwen2.5-vl-72b-instruct",
    ),
}

OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"

# BOUNDED HOSTED FALLBACKS FOR TRANSIENT PROVIDER CAPACITY/AVAILABILITY ISSUES.
# THE USER-SELECTED MODEL IS ALWAYS ATTEMPTED FIRST.
HOSTED_ENGINE_FALLBACK_MODELS: Dict[str, list[str]] = {
    "ollama_gemma3": [
        os.environ.get(
            "OPENROUTER_GEMMA_FALLBACK_MODEL",
            "google/gemma-3-12b-it",
        ),
        os.environ.get(
            "OPENROUTER_GEMMA_SECOND_FALLBACK_MODEL",
            "qwen/qwen2.5-vl-72b-instruct",
        ),
    ],
    "ollama_qwen25vl": [
        os.environ.get(
            "OPENROUTER_QWEN_FALLBACK_MODEL",
            "google/gemma-3-12b-it",
        ),
        os.environ.get(
            "OPENROUTER_QWEN_SECOND_FALLBACK_MODEL",
            "google/gemma-3-4b-it",
        ),
    ],
}

OPENROUTER_RETRYABLE_STATUS_CODES = {
    404, 408, 409, 425, 429, 500, 502, 503, 504,
}


# SET `ENGINE_OPTIONS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
ENGINE_OPTIONS = [
    {
        "key": "ollama_gemma3",
        "label": "Gemma 3 Vision",
        "detail": "Multimodal vision model - local Ollama or hosted API",
        "type": "AI",
        "tooltip": (
            "Faster general-purpose vision option. Locally it uses Ollama; in the hosted "
            "deployment it uses a configured vision API. The ETA is approximate and varies "
            "with provider latency, image resolution, model loading, and concurrent work."
        ),
    },
    {
        "key": "ollama_qwen25vl",
        "label": "Qwen2.5-VL",
        "detail": "Vision-language model - local Ollama or hosted API",
        "type": "AI",
        "tooltip": (
            "Balanced vision-language option. Locally it uses Ollama; in the hosted deployment "
            "it uses a configured vision API. Actual speed depends on provider latency, "
            "image resolution, model availability, and concurrency."
        ),
    },
    {
        "key": "tesseract",
        "label": "Enhanced Tesseract OCR",
        "detail": "Iterative multi-pass standalone OCR reader",
        "type": "OCR",
        "tooltip": (
            "Fast text-only OCR option. The app's ETA assumes about a "
            "1-second base scan plus image-size cost. Multiple preprocessing/OCR passes "
            "can add time. OCR reads text but does not reason about the image like a vision model."
        ),
    },
]


# SET `ENGINE_LABELS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
ENGINE_LABELS = {
    item["key"]: item["label"]
    for item in ENGINE_OPTIONS
}


# SET `VISION_PROMPT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
VISION_PROMPT = """
You are extracting information from an alcoholic-beverage label image.

Do not decide whether the label is legally compliant.
Do not invent text that is not visible.

Extract:
1. Brand name.
2. Product/class/type (for example Merlot, Vodka, American Whiskey, Premium Lager).
3. Alcohol by volume (ABV), if visible.
4. Container size, if visible (for example 750 mL or 12 FL OZ).
5. Government warning text, if visible.
6. Whether the literal heading "GOVERNMENT WARNING" is uppercase.
7. Whether that heading visually appears bold.
8. Useful visible label text in raw_text.
9. Brief notes about glare, blur, curvature, obstruction, or uncertainty.
10. An overall extraction confidence score from 0.0 to 1.0.

Return only the structured response requested by the schema.
""".strip()


# EXTRACT PLAIN TEXT CONTENT FROM AN OLLAMA/OPENAI-COMPATIBLE MODEL RESPONSE SHAPE.
def _message_content(response) -> str:
    # CHECK `HASATTR(RESPONSE, 'MESSAGE') AND HASATTR(RESPONSE.MESSAGE, 'CONTENT')` AND TAKE THE APPROPRIATE BRANCH.
    if hasattr(response, "message") and hasattr(response.message, "content"):
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return response.message.content

    # CHECK `ISINSTANCE(RESPONSE, DICT)` AND TAKE THE APPROPRIATE BRANCH.
    if isinstance(response, dict):
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return response.get("message", {}).get("content", "")

    # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
    raise RuntimeError("Ollama returned an unexpected response format.")


# SEND A LABEL IMAGE TO THE SELECTED LOCAL OLLAMA VISION MODEL AND PARSE ITS STRUCTURED RESPONSE.
def _ollama_extract(
    image_bytes: bytes,
    model: str,
    engine_label: str,
    filename: str,
    prompt: str = VISION_PROMPT,
) -> LabelExtraction:
    # SET `SUFFIX` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    suffix = os.path.splitext(filename)[1].lower()

    # CHECK `SUFFIX NOT IN {'.JPG', '.JPEG', '.PNG', '.WEBP'}` AND TAKE THE APPROPRIATE BRANCH.
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        # SET `SUFFIX` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        suffix = ".jpg"

    # SET `TEMP_PATH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    temp_path = None

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # ENTER THE MANAGED CONTEXT FOR THIS RESOURCE AND GUARANTEE THAT IT IS RELEASED CORRECTLY.
        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=suffix,
        ) as tmp:
            # CALL `TMP.WRITE` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
            tmp.write(image_bytes)
            # SET `TEMP_PATH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            temp_path = tmp.name

        # SET `RESPONSE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        response = ollama.chat(
            model=model,
            messages=[
                {
                    "role": "user",
                    "content": prompt,
                    "images": [temp_path],
                }
            ],
            format=LabelExtraction.model_json_schema(),
            options={
                "temperature": 0,
            },
        )

        # SET `CONTENT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        content = _message_content(response)

        # CHECK `NOT CONTENT` AND TAKE THE APPROPRIATE BRANCH.
        if not content:
            # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
            raise RuntimeError(
                "The selected Ollama model returned no structured output."
            )

        # SET `PARSED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        parsed = LabelExtraction.model_validate_json(content)
        # SET `PARSED.ENGINE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        parsed.engine = engine_label

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return parsed

    finally:
        # CHECK `TEMP_PATH AND OS.PATH.EXISTS(TEMP_PATH)` AND TAKE THE APPROPRIATE BRANCH.
        if temp_path and os.path.exists(temp_path):
            # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
            try:
                # CALL `OS.REMOVE` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
                os.remove(temp_path)
            except OSError:
                # INTENTIONALLY LEAVE THIS BRANCH EMPTY.
                pass


# MAP AN UPLOADED IMAGE FILENAME TO A SAFE MIME TYPE FOR A BASE64 DATA URL.
def _image_mime_type(filename: str) -> str:
    suffix = os.path.splitext(filename)[1].lower()
    return {
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
    }.get(suffix, "image/jpeg")


# EXTRACT A JSON OBJECT EVEN WHEN A MODEL WRAPS IT IN MARKDOWN CODE FENCES.
def _parse_model_json(content: str) -> LabelExtraction:
    value = (content or "").strip()
    if value.startswith("```"):
        value = re.sub(r"^```(?:json)?\s*", "", value, flags=re.IGNORECASE)
        value = re.sub(r"\s*```$", "", value)

    first = value.find("{")
    last = value.rfind("}")
    if first >= 0 and last > first:
        value = value[first:last + 1]

    data = json.loads(value)
    return LabelExtraction.model_validate(data)


# SEND A PRIVATE UPLOADED IMAGE TO OPENROUTER WHEN THE DEPLOYMENT HAS AN API KEY.
def _openrouter_extract(
    image_bytes: bytes,
    model: str,
    engine_label: str,
    filename: str,
    prompt: str = VISION_PROMPT,
    engine_key: str | None = None,
) -> LabelExtraction:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "Hosted vision is not configured. Set OPENROUTER_API_KEY in the deployment "
            "environment, or run Ollama locally."
        )

    mime_type = _image_mime_type(filename)
    encoded = base64.b64encode(image_bytes).decode("ascii")
    data_url = f"data:{mime_type};base64,{encoded}"

    schema_example = {
        "engine": engine_label,
        "brand_name": None,
        "product_type": None,
        "abv": None,
        "container_size": None,
        "government_warning": None,
        "warning_heading_uppercase": None,
        "warning_heading_bold": None,
        "raw_text": "",
        "notes": None,
        "extraction_confidence": None,
    }

    hosted_prompt = (
        prompt
        + "\n\nReturn ONLY one valid JSON object with exactly these keys. "
          "Use null when a value cannot be determined. extraction_confidence must be "
          "a number from 0.0 to 1.0. Do not wrap the JSON in Markdown.\n"
        + json.dumps(schema_example)
    )

    # BUILD A SMALL, DE-DUPLICATED MODEL CHAIN.
    candidate_models = [model]

    if engine_key:
        candidate_models.extend(
            HOSTED_ENGINE_FALLBACK_MODELS.get(
                engine_key,
                [],
            )
        )

    models_to_try = []
    for candidate in candidate_models:
        candidate = str(candidate or "").strip()
        if candidate and candidate not in models_to_try:
            models_to_try.append(candidate)

    last_error = None

    for attempt_index, candidate_model in enumerate(
        models_to_try,
        start=1,
    ):
        response = requests.post(
            OPENROUTER_API_URL,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": os.environ.get(
                    "OPENROUTER_SITE_URL",
                    "https://ttb-label-verifier-production-5a55.up.railway.app",
                ),
                "X-Title": "TTB Label Verifier",
            },
            json={
                "model": candidate_model,
                "temperature": 0,
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": hosted_prompt,
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": data_url,
                                },
                            },
                        ],
                    }
                ],
            },
            timeout=120,
        )

        if not response.ok:
            detail = response.text.strip()
            if len(detail) > 600:
                detail = detail[:600] + "..."

            last_error = RuntimeError(
                f"Hosted vision request failed ({response.status_code}) "
                f"using {candidate_model}. {detail}"
            )

            # RETRY ONLY CAPACITY/ROUTING/AVAILABILITY FAILURES.
            # AUTH OR BAD-REQUEST ERRORS ARE SURFACED IMMEDIATELY.
            if (
                response.status_code
                in OPENROUTER_RETRYABLE_STATUS_CODES
                and attempt_index < len(models_to_try)
            ):
                continue

            raise last_error

        payload = response.json()

        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise RuntimeError(
                "Hosted vision returned an unexpected response format."
            ) from exc

        parsed = _parse_model_json(content)
        parsed.engine = engine_label

        if candidate_model != model:
            fallback_note = (
                f"Hosted fallback used: {candidate_model} because the primary "
                "hosted model was temporarily unavailable."
            )

            if parsed.notes:
                parsed.notes = (
                    str(parsed.notes).strip()
                    + " "
                    + fallback_note
                )
            else:
                parsed.notes = fallback_note

        return parsed

    if last_error:
        raise last_error

    raise RuntimeError(
        "Hosted vision could not find an available model route."
    )


# DECODE UPLOADED IMAGE BYTES INTO AN OPENCV BGR IMAGE MATRIX.
def _load_bgr(image_bytes: bytes) -> np.ndarray:
    # SET `PIL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    pil = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    # SET `RGB` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    rgb = np.array(pil)
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)


# GENERATE MULTIPLE PREPROCESSED IMAGE VARIANTS SO TESSERACT CAN RETRY DIFFICULT LABEL TEXT.
def _ocr_variants(
    image: np.ndarray,
    round_number: int,
) -> list[np.ndarray]:
    # SET `SCALE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    scale = 1.5 + (round_number * 0.35)

    # SET `RESIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    resized = cv2.resize(
        image,
        None,
        fx=scale,
        fy=scale,
        interpolation=cv2.INTER_CUBIC,
    )

    # SET `GRAY` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    gray = cv2.cvtColor(
        resized,
        cv2.COLOR_BGR2GRAY,
    )

    # SET `EQUALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    equalized = cv2.equalizeHist(gray)

    # SET `ADAPTIVE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    adaptive = cv2.adaptiveThreshold(
        gray,
        255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        41,
        11,
    )

    # SET `(_, OTSU)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    _, otsu = cv2.threshold(
        gray,
        0,
        255,
        cv2.THRESH_BINARY + cv2.THRESH_OTSU,
    )

    # SET `BLUR` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    blur = cv2.GaussianBlur(
        gray,
        (0, 0),
        1.2,
    )

    # SET `SHARPENED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    sharpened = cv2.addWeighted(
        gray,
        1.8,
        blur,
        -0.8,
        0,
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return [
        gray,
        equalized,
        adaptive,
        otsu,
        sharpened,
    ]


# NORMALIZE OCR TEXT WHILE PRESERVING USEFUL LINE STRUCTURE.
def _clean_text(value: str) -> str:
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = value.replace("\x0c", " ")
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"[ \t]+", " ", value)
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"\n{3,}", "\n\n", value)
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return value.strip()


# NORMALIZE TEXT AGGRESSIVELY FOR SIMILARITY COMPARISONS BETWEEN OCR PASSES.
def _normalized_for_similarity(value: str) -> str:
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = value.casefold()
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"\s+", " ", value)
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"[^a-z0-9% ]+", "", value)
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return value.strip()


# CALCULATE A USABLE AVERAGE OCR CONFIDENCE SCORE FROM TESSERACT TOKEN DATA.
def _ocr_confidence(
    image: np.ndarray,
    config: str,
) -> float:
    # SET `DATA` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    data = pytesseract.image_to_data(
        image,
        config=config,
        output_type=Output.DICT,
    )

    # SET `CONFIDENCES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    confidences = []

    # LOOP THROUGH `ZIP(DATA.GET('CONF', []), DATA.GET('TEXT', []))` AND PROCESS EACH `(RAW_CONF, TEXT)`.
    for raw_conf, text in zip(
        data.get("conf", []),
        data.get("text", []),
    ):
        # CHECK `NOT STR(TEXT).STRIP()` AND TAKE THE APPROPRIATE BRANCH.
        if not str(text).strip():
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
        try:
            # SET `CONF` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            conf = float(raw_conf)
        except (TypeError, ValueError):
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CHECK `CONF >= 0` AND TAKE THE APPROPRIATE BRANCH.
        if conf >= 0:
            # CALL `CONFIDENCES.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
            confidences.append(conf)

    # CHECK `NOT CONFIDENCES` AND TAKE THE APPROPRIATE BRANCH.
    if not confidences:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.0

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return sum(confidences) / len(confidences)


# SCORE ONE OCR CANDIDATE USING CONFIDENCE, AMOUNT OF READABLE TEXT, AND USEFUL LABEL SIGNALS.
def _text_score(
    text: str,
    confidence: float,
) -> float:
    # SET `ALPHANUMERIC_COUNT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    alphanumeric_count = len(
        re.findall(r"[A-Za-z0-9]", text)
    )

    # SET `WORD_COUNT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    word_count = len(
        re.findall(r"\b\w+\b", text)
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return (
        alphanumeric_count
        + (word_count * 2.0)
        + (confidence * 1.5)
    )


# COMBINE OCR OUTPUTS WHILE REMOVING DUPLICATE NORMALIZED LINES.
def _merge_unique_lines(texts: Iterable[str]) -> str:
    # SET `ACCEPTED` WITH AN EXPLICIT TYPE ANNOTATION FOR LATER USE.
    accepted: list[str] = []
    # SET `ACCEPTED_NORMALIZED` WITH AN EXPLICIT TYPE ANNOTATION FOR LATER USE.
    accepted_normalized: list[str] = []

    # LOOP THROUGH `TEXTS` AND PROCESS EACH `TEXT`.
    for text in texts:
        # LOOP THROUGH `TEXT.SPLITLINES()` AND PROCESS EACH `RAW_LINE`.
        for raw_line in text.splitlines():
            # SET `LINE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            line = raw_line.strip()

            # CHECK `NOT LINE` AND TAKE THE APPROPRIATE BRANCH.
            if not line:
                # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
                continue

            # SET `NORMALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            normalized = _normalized_for_similarity(line)

            # CHECK `NOT NORMALIZED` AND TAKE THE APPROPRIATE BRANCH.
            if not normalized:
                # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
                continue

            # SET `DUPLICATE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            duplicate = False

            # LOOP THROUGH `ACCEPTED_NORMALIZED` AND PROCESS EACH `EXISTING`.
            for existing in accepted_normalized:
                # SET `SIMILARITY` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                similarity = SequenceMatcher(
                    None,
                    normalized,
                    existing,
                ).ratio()

                # CHECK `SIMILARITY >= 0.92` AND TAKE THE APPROPRIATE BRANCH.
                if similarity >= 0.92:
                    # SET `DUPLICATE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                    duplicate = True
                    # EXIT THE CURRENT LOOP BECAUSE NO FURTHER ITERATIONS ARE NEEDED.
                    break

            # CHECK `NOT DUPLICATE` AND TAKE THE APPROPRIATE BRANCH.
            if not duplicate:
                # CALL `ACCEPTED.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
                accepted.append(line)
                # CALL `ACCEPTED_NORMALIZED.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
                accepted_normalized.append(normalized)

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return "\n".join(accepted)


# RUN TESSERACT ACROSS SEVERAL PREPROCESSING VARIANTS AND KEEP/MERGE THE STRONGEST OCR RESULTS.
def _iterative_tesseract(
    image_bytes: bytes,
    max_rounds: int = 6,
    stable_threshold: float = 0.985,
):
    # SET `IMAGE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    image = _load_bgr(image_bytes)

    # SET `PSM_MODES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    psm_modes = [6, 11, 12]

    # SET `BEST_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    best_text = ""
    # SET `BEST_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    best_score = -1.0
    # SET `BEST_CONFIDENCE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    best_confidence = 0.0
    # SET `PREVIOUS_BEST_NORMALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    previous_best_normalized = ""
    # SET `ROUNDS_COMPLETED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    rounds_completed = 0
    # SET `STRONG_PASSES` WITH AN EXPLICIT TYPE ANNOTATION FOR LATER USE.
    strong_passes: list[tuple[float, str]] = []

    # LOOP THROUGH `RANGE(MAX_ROUNDS)` AND PROCESS EACH `ROUND_NUMBER`.
    for round_number in range(max_rounds):
        # SET `ROUNDS_COMPLETED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        rounds_completed = round_number + 1

        # SET `VARIANTS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        variants = _ocr_variants(
            image,
            round_number,
        )

        # LOOP THROUGH `VARIANTS` AND PROCESS EACH `VARIANT`.
        for variant in variants:
            # LOOP THROUGH `PSM_MODES` AND PROCESS EACH `PSM`.
            for psm in psm_modes:
                # SET `CONFIG` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                config = f"--oem 3 --psm {psm}"

                # SET `TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                text = pytesseract.image_to_string(
                    variant,
                    config=config,
                )

                # SET `TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                text = _clean_text(text)

                # CHECK `NOT TEXT` AND TAKE THE APPROPRIATE BRANCH.
                if not text:
                    # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
                    continue

                # SET `CONFIDENCE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                confidence = _ocr_confidence(
                    variant,
                    config,
                )

                # SET `SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                score = _text_score(
                    text,
                    confidence,
                )

                # CALL `STRONG_PASSES.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
                strong_passes.append(
                    (score, text)
                )

                # CHECK `SCORE > BEST_SCORE` AND TAKE THE APPROPRIATE BRANCH.
                if score > best_score:
                    # SET `BEST_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                    best_score = score
                    # SET `BEST_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                    best_text = text
                    # SET `BEST_CONFIDENCE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                    best_confidence = confidence

        # SET `CURRENT_BEST_NORMALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        current_best_normalized = _normalized_for_similarity(
            best_text
        )

        # CHECK `PREVIOUS_BEST_NORMALIZED AND CURRENT_BEST_NORMALIZED` AND TAKE THE APPROPRIATE BRANCH.
        if (
            previous_best_normalized
            and current_best_normalized
        ):
            # SET `SIMILARITY` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            similarity = SequenceMatcher(
                None,
                previous_best_normalized,
                current_best_normalized,
            ).ratio()

            # CHECK `SIMILARITY >= STABLE_THRESHOLD` AND TAKE THE APPROPRIATE BRANCH.
            if similarity >= stable_threshold:
                # EXIT THE CURRENT LOOP BECAUSE NO FURTHER ITERATIONS ARE NEEDED.
                break

        # SET `PREVIOUS_BEST_NORMALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        previous_best_normalized = current_best_normalized

    # SET `STRONGEST` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    strongest = sorted(
        strong_passes,
        key=lambda item: item[0],
        reverse=True,
    )[:5]

    # SET `MERGED_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    merged_text = _merge_unique_lines(
        text
        for _, text in strongest
    )

    # CHECK `NOT MERGED_TEXT` AND TAKE THE APPROPRIATE BRANCH.
    if not merged_text:
        # SET `MERGED_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        merged_text = best_text

    # SET `CONFIDENCE_0_TO_1` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    confidence_0_to_1 = (
        max(
            0.0,
            min(
                best_confidence / 100.0,
                1.0,
            ),
        )
        if best_confidence
        else None
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "best_text": best_text,
        "merged_text": merged_text,
        "rounds": rounds_completed,
        "confidence": confidence_0_to_1,
    }


# EXTRACT AN ALCOHOL-BY-VOLUME PERCENTAGE FROM OCR TEXT.
def _extract_abv(text: str):
    # SET `PATTERNS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    patterns = [
        r"(\d{1,2}(?:\.\d{1,2})?)\s*%\s*(?:alc\.?\s*/?\s*vol\.?|abv)?",
        r"(?:alc\.?\s*by\s*vol\.?|alcohol\s*by\s*volume)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)\s*%",
    ]

    # LOOP THROUGH `PATTERNS` AND PROCESS EACH `PATTERN`.
    for pattern in patterns:
        # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        # CHECK `MATCH` AND TAKE THE APPROPRIATE BRANCH.
        if match:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return f"{float(match.group(1)):g}%"

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return None



# EXTRACT A RECOGNIZABLE PACKAGE/CONTAINER SIZE FROM OCR TEXT.
def _extract_container_size(text: str):
    # SET `PATTERNS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    patterns = [
        r"\b(\d+(?:\.\d+)?)\s*(mL|ML|ml)\b",
        r"\b(\d+(?:\.\d+)?)\s*(FL\s*OZ|fl\s*oz)\b",
        r"\b(\d+(?:\.\d+)?)\s*(L|l)\b",
    ]

    # LOOP THROUGH `PATTERNS` AND PROCESS EACH `PATTERN`.
    for pattern in patterns:
        # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        match = re.search(
            pattern,
            text,
            flags=re.IGNORECASE,
        )

        # CHECK `MATCH` AND TAKE THE APPROPRIATE BRANCH.
        if match:
            # SET `UNIT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
            unit = re.sub(
                r"\s+",
                " ",
                match.group(2),
            ).upper()

            # CHECK `UNIT == 'ML'` AND TAKE THE APPROPRIATE BRANCH.
            if unit == "ML":
                # SET `UNIT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
                unit = "mL"

            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return f"{match.group(1)} {unit}"

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return None


# INFER THE LIKELY BEVERAGE CLASS/TYPE FROM OCR TEXT USING DETERMINISTIC PHRASE PATTERNS.
def _guess_product_type(text: str, brand_name: str | None):
    # SET `LINES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    # SET `IGNORED_FRAGMENTS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    ignored_fragments = [
        "government warning",
        "alc/vol",
        "alc / vol",
        "750 ml",
        "fl oz",
        "according to the surgeon",
        "pregnancy",
        "health problems",
    ]

    # SET `BRAND_NORMALIZED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    brand_normalized = (
        re.sub(
            r"\s+",
            " ",
            (brand_name or "").casefold(),
        ).strip()
    )

    # SET `CANDIDATES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    candidates = []

    # LOOP THROUGH `LINES` AND PROCESS EACH `LINE`.
    for line in lines:
        # SET `LOWER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        lower = line.casefold()

        # CHECK `ANY((FRAGMENT IN LOWER FOR FRAGMENT IN IGNORED_FRAGMENTS))` AND TAKE THE APPROPRIATE BRANCH.
        if any(
            fragment in lower
            for fragment in ignored_fragments
        ):
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CHECK `RE.SEARCH('\\B\\D{1,2}(?:\\.\\D+)?\\S*%', LINE)` AND TAKE THE APPROPRIATE BRANCH.
        if re.search(
            r"\b\d{1,2}(?:\.\d+)?\s*%",
            line,
        ):
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CHECK `BRAND_NORMALIZED AND BRAND_NORMALIZED IN LOWER` AND TAKE THE APPROPRIATE BRANCH.
        if brand_normalized and brand_normalized in lower:
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CHECK `NOT 2 <= LEN(LINE) <= 55` AND TAKE THE APPROPRIATE BRANCH.
        if not (2 <= len(line) <= 55):
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CALL `CANDIDATES.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
        candidates.append(line)

    # PREFER FAMILIAR ALCOHOL CLASS/TYPE TERMS IF OCR FOUND THEM.
    # SET `KEYWORDS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    keywords = [
        "cabernet sauvignon",
        "american whiskey",
        "small batch bourbon",
        "bourbon",
        "premium lager",
        "india pale ale",
        "hard cider",
        "spiced rum",
        "chardonnay",
        "merlot",
        "vodka",
        "whiskey",
        "lager",
        "cider",
        "rum",
    ]

    # SET `FULL_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    full_text = text.casefold()

    # LOOP THROUGH `KEYWORDS` AND PROCESS EACH `KEYWORD`.
    for keyword in keywords:
        # CHECK `KEYWORD IN FULL_TEXT` AND TAKE THE APPROPRIATE BRANCH.
        if keyword in full_text:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return keyword.title()

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return candidates[0] if candidates else None


# ESTIMATE A LIKELY BRAND NAME FROM PROMINENT OCR LINES.
def _guess_brand(text: str):
    # SET `LINES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    lines = [
        line.strip()
        for line in text.splitlines()
        if line.strip()
    ]

    # CHECK `NOT LINES` AND TAKE THE APPROPRIATE BRANCH.
    if not lines:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return None

    # SET `CANDIDATES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    candidates = [
        line
        for line in lines
        if 2 <= len(line) <= 60
        and "government warning" not in line.lower()
        and not re.search(r"\d+\s*%", line)
    ]

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return candidates[0] if candidates else lines[0]


# LOCATE THE GOVERNMENT WARNING TEXT INSIDE OCR OUTPUT.
def _extract_warning(text: str):
    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = re.search(
        r"(GOVERNMENT\s+WARNING.*)",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )

    # CHECK `MATCH` AND TAKE THE APPROPRIATE BRANCH.
    if match:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return match.group(1).strip()

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return None


# CONVERT ENHANCED TESSERACT OCR OUTPUT INTO THE SAME LABELEXTRACTION STRUCTURE USED BY VISION MODELS.
def _tesseract_extract(
    image_bytes: bytes,
) -> LabelExtraction:
    # VERIFY THE TESSERACT EXECUTABLE BEFORE STARTING OCR WORK.
    _ensure_tesseract_available()

    # SET `RESULT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    result = _iterative_tesseract(
        image_bytes=image_bytes,
        max_rounds=6,
        stable_threshold=0.985,
    )

    # SET `BEST_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    best_text = result["best_text"]
    # SET `MERGED_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    merged_text = result["merged_text"]
    # SET `ANALYSIS_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    analysis_text = merged_text or best_text

    # SET `WARNING_UPPER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    warning_upper = (
        True
        if "GOVERNMENT WARNING" in analysis_text
        else False
        if "government warning" in analysis_text.lower()
        else None
    )

    # SET `WARNING_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    warning_text = _extract_warning(
        analysis_text
    )

    # SET `BRAND_NAME` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    brand_name = _guess_brand(
        best_text or analysis_text
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return LabelExtraction(
        engine=ENGINE_LABELS["tesseract"],
        brand_name=brand_name,
        product_type=_guess_product_type(
            analysis_text,
            brand_name,
        ),
        abv=_extract_abv(
            analysis_text
        ),
        container_size=_extract_container_size(
            analysis_text
        ),
        government_warning=warning_text,
        warning_heading_uppercase=warning_upper,
        warning_heading_bold=None,
        raw_text=analysis_text,
        notes=(
            "Iterative OCR completed "
            f"{result['rounds']} round(s), using multiple scales, "
            "contrast treatments, thresholds, and page segmentation modes."
        ),
        extraction_confidence=result["confidence"],
    )


# DISPATCH LABEL ANALYSIS TO THE REQUESTED VISION/OCR ENGINE AND RETURN ONE NORMALIZED LABELEXTRACTION OBJECT.
def extract_label(
    image_bytes: bytes,
    engine_key: str,
    filename: str,
) -> LabelExtraction:

    # CHECK `ENGINE_KEY == 'TESSERACT'` AND TAKE THE APPROPRIATE BRANCH.
    if engine_key == "tesseract":
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return _tesseract_extract(
            image_bytes
        )

    # CHECK `ENGINE_KEY NOT IN ENGINE_MODELS` AND TAKE THE APPROPRIATE BRANCH.
    if engine_key not in ENGINE_MODELS:
        # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
        raise ValueError(
            f"Unknown analysis engine: {engine_key}"
        )

    # USE THE HOSTED VISION API WHEN A DEPLOYMENT KEY IS PRESENT.
    if os.environ.get("OPENROUTER_API_KEY", "").strip():
        return _openrouter_extract(
            image_bytes=image_bytes,
            model=HOSTED_ENGINE_MODELS[engine_key],
            engine_label=ENGINE_LABELS[engine_key],
            filename=filename,
            engine_key=engine_key,
        )

    # OTHERWISE PRESERVE THE ORIGINAL LOCAL OLLAMA WORKFLOW.
    try:
        return _ollama_extract(
            image_bytes=image_bytes,
            model=ENGINE_MODELS[engine_key],
            engine_label=ENGINE_LABELS[engine_key],
            filename=filename,
        )
    except Exception as exc:
        raise RuntimeError(
            "Failed to connect to local Ollama. Start Ollama for local use, or configure "
            "OPENROUTER_API_KEY for hosted deployment."
        ) from exc
