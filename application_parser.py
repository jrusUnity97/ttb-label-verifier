# ============================================================================
# ANNOTATED STUDY COPY
# THESE COMMENTS ARE INTENTIONALLY MORE DETAILED THAN NORMAL PRODUCTION CODE.
# THEY EXPLAIN EACH FUNCTION AND LOGICAL STATEMENT/BLOCK SO THE AUTHOR CAN
# REHEARSE THE DATA FLOW AND DESIGN DECISIONS BEFORE A TECHNICAL DISCUSSION.
# THE ORIGINAL SUBMISSION PACKAGE REMAINS UNCHANGED.
# ============================================================================


# IMPORT ANNOTATIONS FROM __FUTURE__ FOR THE OPERATIONS USED BELOW.
from __future__ import annotations

# IMPORT RE FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import re
# IMPORT OPTIONAL FROM TYPING FOR THE OPERATIONS USED BELOW.
from typing import Optional

# IMPORT FITZ FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import fitz


# NORMALIZE OPTIONAL EXTRACTED TEXT BY COLLAPSING WHITESPACE AND CONVERTING EMPTY STRINGS TO NONE.
def _clean(value: Optional[str]) -> Optional[str]:
    # CHECK `VALUE IS NONE` AND TAKE THE APPROPRIATE BRANCH.
    if value is None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return None

    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"\s+", " ", value).strip()

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return value or None


# READ THE VALUE IMMEDIATELY FOLLOWING A KNOWN LABEL IN A TEXT-BASED APPLICATION PDF.
def _field_after_label(text: str, label_pattern: str) -> Optional[str]:
    """
    Read the first non-empty line after a known form label.

    Works well with generated prototype forms and many text-based PDF forms.
    """

    # SET `PATTERN` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    pattern = re.compile(
        rf"(?:^|\n){label_pattern}\s*\n\s*([^\n]+)",
        flags=re.IGNORECASE,
    )

    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = pattern.search(text)

    # CHECK `NOT MATCH` AND TAKE THE APPROPRIATE BRANCH.
    if not match:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return None

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return _clean(match.group(1))


# SEARCH THE PDF TEXT FOR AN APPLICATION IDENTIFIER WHEN THE LABELED FIELD CANNOT BE FOUND.
def _fallback_application_id(text: str) -> Optional[str]:
    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = re.search(
        r"\b(?:APP|APPLICATION)[-_ ]?\d{4}[-_ ]?\d{3,8}\b",
        text,
        flags=re.IGNORECASE,
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return _clean(match.group(0)) if match else None


# SEARCH THE PDF TEXT FOR A PERCENTAGE THAT CAN SERVE AS A FALLBACK ABV VALUE.
def _fallback_abv(text: str) -> Optional[str]:
    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = re.search(
        r"\b(\d{1,2}(?:\.\d{1,2})?)\s*%",
        text,
        flags=re.IGNORECASE,
    )

    # CHECK `NOT MATCH` AND TAKE THE APPROPRIATE BRANCH.
    if not match:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return None

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return f"{match.group(1)}%"


# SEARCH THE PDF TEXT FOR A RECOGNIZABLE CONTAINER-SIZE EXPRESSION.
def _fallback_size(text: str) -> Optional[str]:
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
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return _clean(
                f"{match.group(1)} {match.group(2)}"
            )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return None


# OPEN A TEXT-BASED APPLICATION PDF AND CONVERT ITS IMPORTANT FIELDS INTO ONE STRUCTURED RECORD.
def extract_application_pdf(
    pdf_bytes: bytes,
    filename: str,
) -> dict:
    """
    Extract structured application-form fields from a PDF.

    This is intentionally local and deterministic. The AI/vision model is used
    to read the label artwork; these extracted application fields become the
    candidate records that the matching engine reconciles against the label.
    """

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # SET `DOCUMENT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        document = fitz.open(
            stream=pdf_bytes,
            filetype="pdf",
        )
    except Exception as exc:
        # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
        raise ValueError(
            f"Could not open PDF application form: {filename}"
        ) from exc

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # SET `RAW_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        raw_text = "\n".join(
            page.get_text("text")
            for page in document
        )
    finally:
        # CALL `DOCUMENT.CLOSE` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
        document.close()

    # SET `RAW_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    raw_text = raw_text.strip()

    # CHECK `NOT RAW_TEXT` AND TAKE THE APPROPRIATE BRANCH.
    if not raw_text:
        # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
        raise ValueError(
            "No selectable text was found in this application PDF. "
            "This prototype currently expects a text-based PDF form."
        )

    # SET `APPLICATION_ID` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    application_id = (
        _field_after_label(
            raw_text,
            r"APPLICATION\s+ID",
        )
        or
        _fallback_application_id(
            raw_text
        )
    )

    # SET `BRAND_NAME` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    brand_name = _field_after_label(
        raw_text,
        r"BRAND\s+NAME",
    )

    # SET `PRODUCT_TYPE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    product_type = _field_after_label(
        raw_text,
        r"CLASS\s*/\s*TYPE",
    )

    # SET `ABV` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    abv = (
        _field_after_label(
            raw_text,
            r"ALCOHOL\s+BY\s+VOLUME\s*\(ABV\)",
        )
        or
        _fallback_abv(
            raw_text
        )
    )

    # SET `CONTAINER_SIZE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    container_size = (
        _field_after_label(
            raw_text,
            r"CONTAINER\s+SIZE",
        )
        or
        _fallback_size(
            raw_text
        )
    )

    # SET `ARTWORK_FILENAME` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    artwork_filename = _field_after_label(
        raw_text,
        r"ATTACHED\s+ARTWORK\s+FILE",
    )

    # SET `APPLICANT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    applicant = _field_after_label(
        raw_text,
        r"APPLICANT\s*/\s*PERMITTEE",
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "filename": filename,
        "application_id": application_id,
        "brand_name": brand_name,
        "product_type": product_type,
        "abv": abv,
        "container_size": container_size,
        "artwork_filename": artwork_filename,
        "applicant": applicant,
        "raw_text": raw_text,
    }
