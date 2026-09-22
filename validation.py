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
# IMPORT SEQUENCEMATCHER FROM DIFFLIB FOR THE OPERATIONS USED BELOW.
from difflib import SequenceMatcher

# IMPORT LABELEXTRACTION FROM MODELS FOR THE OPERATIONS USED BELOW.
from models import LabelExtraction


# SET `REQUIRED_WARNING` FOR USE BY THE FOLLOWING PROCESSING STEPS.
REQUIRED_WARNING = (
    "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink "
    "alcoholic beverages during pregnancy because of the risk of birth defects. "
    "(2) Consumption of alcoholic beverages impairs your ability to drive a car or "
    "operate machinery, and may cause health problems."
)


# NORMALIZE TEXT FOR APPLICATION-MATCHING COMPARISONS.
def _normalize(value: str) -> str:
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = (value or "").casefold()
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"[’']", "'", value)
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"[^a-z0-9%.' ]+", " ", value)
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"\s+", " ", value)
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return value.strip()


# EXTRACT A NUMERIC ABV VALUE FROM FREE-FORM TEXT.
def _parse_abv(value: str):
    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = re.search(r"(\d{1,2}(?:\.\d{1,2})?)", value or "")
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return float(match.group(1)) if match else None


# COMPARE THE APPLICATION BRAND AND EXTRACTED LABEL BRAND USING EXACT AND FUZZY MATCHING THRESHOLDS.
def _brand_check(application_brand: str, extracted_brand: str | None):
    # CHECK `NOT APPLICATION_BRAND.STRIP()` AND TAKE THE APPROPRIATE BRANCH.
    if not application_brand.strip():
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW", "No brand value from the application form was supplied."

    # CHECK `NOT EXTRACTED_BRAND` AND TAKE THE APPROPRIATE BRANCH.
    if not extracted_brand:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW", "The analysis engine could not extract a brand name."

    # SET `EXPECTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    expected = _normalize(application_brand)
    # SET `ACTUAL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    actual = _normalize(extracted_brand)

    # CHECK `EXPECTED == ACTUAL` AND TAKE THE APPROPRIATE BRANCH.
    if expected == actual:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "PASS", f'Brand matches: "{extracted_brand}".'

    # SET `SIMILARITY` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    similarity = SequenceMatcher(None, expected, actual).ratio()

    # CHECK `SIMILARITY >= 0.82` AND TAKE THE APPROPRIATE BRANCH.
    if similarity >= 0.82:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "PASS",
            f'Likely equivalent brand: "{extracted_brand}" '
            f"({similarity:.0%} similarity).",
        )

    # CHECK `SIMILARITY >= 0.62` AND TAKE THE APPROPRIATE BRANCH.
    if similarity >= 0.62:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "REVIEW",
            f'Possible brand match: "{extracted_brand}" '
            f"({similarity:.0%} similarity).",
        )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return (
        "FAIL",
        f'Application form says "{application_brand}"; '
        f'label appears to say "{extracted_brand}".',
    )


# COMPARE APPLICATION AND LABEL ABV VALUES USING A SMALL NUMERIC TOLERANCE.
def _abv_check(application_abv: str, extracted_abv: str | None):
    # CHECK `NOT APPLICATION_ABV.STRIP()` AND TAKE THE APPROPRIATE BRANCH.
    if not application_abv.strip():
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW", "No ABV value from the application form was supplied."

    # SET `EXPECTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    expected = _parse_abv(application_abv)
    # SET `ACTUAL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    actual = _parse_abv(extracted_abv or "")

    # CHECK `EXPECTED IS NONE` AND TAKE THE APPROPRIATE BRANCH.
    if expected is None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW", "The application-form ABV is not a valid percentage."

    # CHECK `ACTUAL IS NONE` AND TAKE THE APPROPRIATE BRANCH.
    if actual is None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW", "The analysis engine could not confidently extract an ABV."

    # CHECK `ABS(EXPECTED - ACTUAL) <= 0.05` AND TAKE THE APPROPRIATE BRANCH.
    if abs(expected - actual) <= 0.05:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "PASS", f"Application form: {expected:g}%; label: {actual:g}%."

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return "FAIL", f"Application form: {expected:g}%; label: {actual:g}%."


# VALIDATE WARNING PRESENCE, WORDING SIMILARITY, AND VISIBLE HEADING FORMATTING.
def _warning_check(extracted: LabelExtraction):
    # CHECK `NOT EXTRACTED.GOVERNMENT_WARNING` AND TAKE THE APPROPRIATE BRANCH.
    if not extracted.government_warning:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "FAIL", "Government warning text was not detected."

    # SET `EXPECTED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    expected = _normalize(REQUIRED_WARNING)
    # SET `ACTUAL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    actual = _normalize(extracted.government_warning)

    # SET `SIMILARITY` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    similarity = SequenceMatcher(None, expected, actual).ratio()

    # CHECK `EXTRACTED.WARNING_HEADING_UPPERCASE IS FALSE` AND TAKE THE APPROPRIATE BRANCH.
    if extracted.warning_heading_uppercase is False:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "FAIL",
            'The "GOVERNMENT WARNING" heading was not confirmed in uppercase.',
        )

    # CHECK `EXTRACTED.WARNING_HEADING_BOLD IS FALSE` AND TAKE THE APPROPRIATE BRANCH.
    if extracted.warning_heading_bold is False:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "FAIL",
            'The "GOVERNMENT WARNING" heading does not appear bold.',
        )

    # CHECK `SIMILARITY >= 0.94` AND TAKE THE APPROPRIATE BRANCH.
    if similarity >= 0.94:
        # CHECK `EXTRACTED.WARNING_HEADING_BOLD IS NONE` AND TAKE THE APPROPRIATE BRANCH.
        if extracted.warning_heading_bold is None:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return (
                "REVIEW",
                "Warning wording appears correct, but bold formatting "
                "could not be verified.",
            )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "PASS",
            "Warning wording and visible heading formatting appear correct.",
        )

    # CHECK `SIMILARITY >= 0.75` AND TAKE THE APPROPRIATE BRANCH.
    if similarity >= 0.75:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return (
            "REVIEW",
            "Government warning was detected, but the wording needs "
            "human verification.",
        )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return (
        "FAIL",
        "Detected warning text differs substantially from the required wording.",
    )


# COLLAPSE FIELD-LEVEL STATUSES INTO A SINGLE OVERALL PASS, FAIL, OR REVIEW RESULT.
def _overall(*statuses: str) -> str:
    # CHECK `'FAIL' IN STATUSES` AND TAKE THE APPROPRIATE BRANCH.
    if "FAIL" in statuses:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "FAIL"

    # CHECK `'REVIEW' IN STATUSES` AND TAKE THE APPROPRIATE BRANCH.
    if "REVIEW" in statuses:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return "REVIEW"

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return "PASS"


# RUN BRAND, ABV, AND GOVERNMENT-WARNING VALIDATION AND ASSEMBLE THE FIELD-BY-FIELD RESULT.
def verify_label(
    extracted: LabelExtraction,
    application_brand: str,
    application_abv: str,
):
    # SET `(BRAND_STATUS, BRAND_DETAIL)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    brand_status, brand_detail = _brand_check(
        application_brand,
        extracted.brand_name,
    )

    # SET `(ABV_STATUS, ABV_DETAIL)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    abv_status, abv_detail = _abv_check(
        application_abv,
        extracted.abv,
    )

    # SET `(WARNING_STATUS, WARNING_DETAIL)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    warning_status, warning_detail = _warning_check(extracted)

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "brand_status": brand_status,
        "brand_detail": brand_detail,
        "abv_status": abv_status,
        "abv_detail": abv_detail,
        "warning_status": warning_status,
        "warning_detail": warning_detail,
        "overall_status": _overall(
            brand_status,
            abv_status,
            warning_status,
        ),
    }



# RETURN REVIEW RESULTS WHEN THE SYSTEM CANNOT CONFIDENTLY IDENTIFY THE CORRECT APPLICATION RECORD.
def verification_without_application(
    match_status: str,
    match_reason: str,
):
    """
    Used when the AI cannot confidently pair a label with an application.
    The label can still be extracted, but compliance comparison requires a
    human to confirm which application record belongs to it.
    """

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "brand_status": "REVIEW",
        "brand_detail": (
            "Application comparison unavailable until the correct "
            "application form is confirmed."
        ),
        "abv_status": "REVIEW",
        "abv_detail": (
            "Application comparison unavailable until the correct "
            "application form is confirmed."
        ),
        "warning_status": "REVIEW",
        "warning_detail": (
            "Label extraction completed, but the application match "
            "must be confirmed before final verification."
        ),
        "overall_status": "REVIEW",
        "match_status": match_status,
        "match_reason": match_reason,
    }
