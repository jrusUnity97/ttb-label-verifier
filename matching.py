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
# IMPORT ANY FROM TYPING FOR THE OPERATIONS USED BELOW.
from typing import Any

# IMPORT LABELEXTRACTION FROM MODELS FOR THE OPERATIONS USED BELOW.
from models import LabelExtraction


# NORMALIZE TEXT FOR APPLICATION-MATCHING COMPARISONS.
def _normalize(value: str | None) -> str:
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = (value or "").casefold()
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = value.replace("’", "'")
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"[^a-z0-9%.' ]+", " ", value)
    # SET `VALUE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    value = re.sub(r"\s+", " ", value)
    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return value.strip()


# RETURN A 0-TO-1 TEXT SIMILARITY SCORE AFTER NORMALIZATION.
def _similarity(a: str | None, b: str | None) -> float:
    # SET `LEFT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    left = _normalize(a)
    # SET `RIGHT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    right = _normalize(b)

    # CHECK `NOT LEFT OR NOT RIGHT` AND TAKE THE APPROPRIATE BRANCH.
    if not left or not right:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.0

    # CHECK `LEFT == RIGHT` AND TAKE THE APPROPRIATE BRANCH.
    if left == right:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 1.0

    # CHECK `LEFT IN RIGHT OR RIGHT IN LEFT` AND TAKE THE APPROPRIATE BRANCH.
    if left in right or right in left:
        # SET `SHORTER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        shorter = min(len(left), len(right))
        # SET `LONGER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        longer = max(len(left), len(right))

        # CHECK `LONGER` AND TAKE THE APPROPRIATE BRANCH.
        if longer:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return max(
                0.90,
                shorter / longer,
            )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return SequenceMatcher(
        None,
        left,
        right,
    ).ratio()


# SCORE WHETHER AN EXPECTED PHRASE IS VISIBLY REPRESENTED INSIDE EXTRACTED LABEL TEXT.
def _text_presence(
    candidate: str | None,
    raw_text: str | None,
) -> float:
    # SET `CANDIDATE_N` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    candidate_n = _normalize(candidate)
    # SET `RAW_N` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    raw_n = _normalize(raw_text)

    # CHECK `NOT CANDIDATE_N OR NOT RAW_N` AND TAKE THE APPROPRIATE BRANCH.
    if not candidate_n or not raw_n:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.0

    # CHECK `CANDIDATE_N IN RAW_N` AND TAKE THE APPROPRIATE BRANCH.
    if candidate_n in raw_n:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 1.0

    # COMPARE CANDIDATE AGAINST INDIVIDUAL OCR/VISION LINES AS A SOFTER SIGNAL.
    # SET `LINE_SCORES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    line_scores = [
        SequenceMatcher(
            None,
            candidate_n,
            _normalize(line),
        ).ratio()
        for line in (raw_text or "").splitlines()
        if _normalize(line)
    ]

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return max(line_scores, default=0.0)


# EXTRACT THE FIRST NUMERIC VALUE FROM A TEXT FIELD FOR NUMERIC COMPARISONS.
def _parse_number(value: str | None):
    # SET `MATCH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    match = re.search(
        r"(\d+(?:\.\d+)?)",
        value or "",
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return float(match.group(1)) if match else None


# COMPARE NUMERIC VALUES WITH TOLERANCE AND RETURN A 0-TO-1 SIMILARITY SCORE.
def _numeric_similarity(
    a: str | None,
    b: str | None,
    tolerance: float,
) -> float:
    # SET `LEFT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    left = _parse_number(a)
    # SET `RIGHT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    right = _parse_number(b)

    # CHECK `LEFT IS NONE OR RIGHT IS NONE` AND TAKE THE APPROPRIATE BRANCH.
    if left is None or right is None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.0

    # SET `DIFFERENCE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    difference = abs(left - right)

    # CHECK `DIFFERENCE <= TOLERANCE` AND TAKE THE APPROPRIATE BRANCH.
    if difference <= tolerance:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 1.0

    # KEEP A SMALL NONZERO SIGNAL FOR NEARBY VALUES WITHOUT LETTING IT DOMINATE.
    # CHECK `DIFFERENCE <= MAX(TOLERANCE * 10, 3.0)` AND TAKE THE APPROPRIATE BRANCH.
    if difference <= max(tolerance * 10, 3.0):
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.35

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return 0.0


# COMPARE CONTAINER SIZES WHILE ACCOUNTING FOR NORMALIZED TEXT AND NUMERIC VALUES.
def _container_similarity(
    a: str | None,
    b: str | None,
) -> float:
    # SET `LEFT_NUM` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    left_num = _parse_number(a)
    # SET `RIGHT_NUM` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    right_num = _parse_number(b)

    # CHECK `LEFT_NUM IS NONE OR RIGHT_NUM IS NONE` AND TAKE THE APPROPRIATE BRANCH.
    if left_num is None or right_num is None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.0

    # SET `LEFT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    left = _normalize(a)
    # SET `RIGHT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    right = _normalize(b)

    # SET `SAME_UNITS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    same_units = (
        ("ml" in left and "ml" in right)
        or
        ("oz" in left and "oz" in right)
        or
        (
            re.search(r"\bl\b", left)
            and
            re.search(r"\bl\b", right)
        )
    )

    # CHECK `SAME_UNITS AND ABS(LEFT_NUM - RIGHT_NUM) <= 0.05` AND TAKE THE APPROPRIATE BRANCH.
    if same_units and abs(left_num - right_num) <= 0.05:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 1.0

    # CHECK `ABS(LEFT_NUM - RIGHT_NUM) <= 0.05` AND TAKE THE APPROPRIATE BRANCH.
    if abs(left_num - right_num) <= 0.05:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return 0.70

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return 0.0


# CALCULATE THE WEIGHTED EVIDENCE SCORE BETWEEN ONE EXTRACTED LABEL AND ONE CANDIDATE APPLICATION.
def score_application(
    label: LabelExtraction,
    application: dict[str, Any],
) -> dict:
    """
    Weighted content match.

    ABV is intentionally a lower-weight signal because an ABV discrepancy may
    be the violation the system is supposed to discover. A wrong ABV therefore
    should not prevent an otherwise obvious application/label pair.
    """

    # SET `RAW_TEXT` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    raw_text = label.raw_text or ""

    # SET `BRAND_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    brand_score = max(
        _similarity(
            label.brand_name,
            application.get("brand_name"),
        ),
        _text_presence(
            application.get("brand_name"),
            raw_text,
        ),
    )

    # SET `PRODUCT_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    product_score = max(
        _similarity(
            label.product_type,
            application.get("product_type"),
        ),
        _text_presence(
            application.get("product_type"),
            raw_text,
        ),
    )

    # SET `SIZE_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    size_score = max(
        _container_similarity(
            label.container_size,
            application.get("container_size"),
        ),
        _text_presence(
            application.get("container_size"),
            raw_text,
        ),
    )

    # SET `ABV_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    abv_score = max(
        _numeric_similarity(
            label.abv,
            application.get("abv"),
            tolerance=0.05,
        ),
        _text_presence(
            application.get("abv"),
            raw_text,
        ),
    )

    # MATCHING WEIGHTS ARE INTENTIONALLY DIFFERENT FROM COMPLIANCE VALIDATION.
    # BRAND/PRODUCT/SIZE IDENTIFY THE RECORD. ABV REMAINS USEFUL BUT CANNOT VETO
    # A MATCH BECAUSE ABV MISMATCH IS A COMPLIANCE FINDING.
    # SET `TOTAL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    total = (
        brand_score * 0.45
        +
        product_score * 0.25
        +
        size_score * 0.15
        +
        abv_score * 0.15
    )

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "score": round(total, 4),
        "brand_score": round(brand_score, 4),
        "product_score": round(product_score, 4),
        "size_score": round(size_score, 4),
        "abv_score": round(abv_score, 4),
    }


# RANK ALL CANDIDATE APPLICATIONS AND CLASSIFY THE BEST PAIRING AS MATCHED, UNCERTAIN, OR UNMATCHED.
def match_application(
    label: LabelExtraction,
    applications: list[dict],
) -> dict:
    # CHECK `NOT APPLICATIONS` AND TAKE THE APPROPRIATE BRANCH.
    if not applications:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return {
            "status": "UNMATCHED",
            "confidence": 0,
            "application": None,
            "alternatives": [],
            "reason": "No application forms were available.",
        }

    # SET `SCORED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    scored = []

    # LOOP THROUGH `APPLICATIONS` AND PROCESS EACH `APPLICATION`.
    for application in applications:
        # SET `SCORES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        scores = score_application(
            label,
            application,
        )

        # CALL `SCORED.APPEND` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
        scored.append(
            {
                "application": application,
                **scores,
            }
        )

    # CALL `SCORED.SORT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    scored.sort(
        key=lambda item: item["score"],
        reverse=True,
    )

    # SET `BEST` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    best = scored[0]

    # SET `SECOND_SCORE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    second_score = (
        scored[1]["score"]
        if len(scored) > 1
        else 0.0
    )

    # SET `MARGIN` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    margin = (
        best["score"]
        -
        second_score
    )

    # CHECK `BEST['SCORE'] >= 0.72 AND MARGIN >= 0.08` AND TAKE THE APPROPRIATE BRANCH.
    if best["score"] >= 0.72 and margin >= 0.08:
        # SET `STATUS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        status = "MATCHED"
    # CHECK `BEST['SCORE'] >= 0.5` AND TAKE THE APPROPRIATE BRANCH.
    elif best["score"] >= 0.50:
        # SET `STATUS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        status = "UNCERTAIN"
    else:
        # SET `STATUS` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        status = "UNMATCHED"

    # SET `CONFIDENCE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    confidence = round(
        best["score"] * 100
    )

    # SET `ALTERNATIVES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    alternatives = [
        {
            "application_id":
                candidate["application"].get(
                    "application_id"
                ),
            "filename":
                candidate["application"].get(
                    "filename"
                ),
            "score":
                round(
                    candidate["score"] * 100
                ),
        }
        for candidate in scored[1:4]
    ]

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return {
        "status": status,
        "confidence": confidence,
        "application":
            best["application"]
            if status != "UNMATCHED"
            else None,
        "alternatives": alternatives,
        "reason": (
            "Content match based on brand, product/class, "
            "container size, and ABV signals."
        ),
        "signals": {
            "brand":
                round(
                    best["brand_score"] * 100
                ),
            "product":
                round(
                    best["product_score"] * 100
                ),
            "container_size":
                round(
                    best["size_score"] * 100
                ),
            "abv":
                round(
                    best["abv_score"] * 100
                ),
        },
    }
