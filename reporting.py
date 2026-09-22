from __future__ import annotations

import csv
import io
import json
import textwrap
from datetime import datetime, timezone
from typing import Any

import fitz


REPORT_COLUMNS = [
    "record_type",
    "filename",
    "queue_status",
    "receipt_number",
    "engine",
    "processing_seconds",
    "overall_status",
    "application_id",
    "applicant",
    "application_filename",
    "artwork_filename",
    "application_brand",
    "application_product_type",
    "application_abv",
    "application_container_size",
    "match_status",
    "match_confidence",
    "match_reason",
    "match_brand_signal",
    "match_product_signal",
    "match_container_size_signal",
    "match_abv_signal",
    "match_alternatives",
    "label_brand",
    "label_product_type",
    "label_abv",
    "label_container_size",
    "government_warning",
    "warning_heading_uppercase",
    "warning_heading_bold",
    "extraction_confidence",
    "extraction_notes",
    "brand_check_status",
    "brand_check_detail",
    "abv_check_status",
    "abv_check_detail",
    "warning_check_status",
    "warning_check_detail",
    "image_width",
    "image_height",
    "image_megapixels",
    "file_size_bytes",
    "estimated_seconds",
    "raw_text",
    "error",
    "summary_total",
    "summary_passed",
    "summary_failed",
    "summary_review",
    "summary_skipped",
    "summary_errors",
    "summary_waiting",
]


def _string(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(
        value,
        (dict, list),
    ):
        return json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
        )

    return str(value)


def _csv_safe(value: Any) -> Any:
    """
    Protect spreadsheet users from CSV formula injection when OCR/model text
    begins with a character that spreadsheet software can interpret as a formula.
    """

    if value is None:
        return ""

    if isinstance(
        value,
        (int, float),
    ):
        return value

    text = _string(value)

    if text.startswith(
        ("=", "+", "-", "@")
    ):
        return "'" + text

    return text


def _summary_row(
    summary: dict[str, Any],
) -> dict[str, Any]:
    row = {
        key: ""
        for key in REPORT_COLUMNS
    }

    row.update(
        {
            "record_type": "BATCH_SUMMARY",
            "summary_total": summary.get("total", 0),
            "summary_passed": summary.get("passed", 0),
            "summary_failed": summary.get("failed", 0),
            "summary_review": summary.get("review", 0),
            "summary_skipped": summary.get("skipped", 0),
            "summary_errors": summary.get("errors", 0),
            "summary_waiting": summary.get("waiting", 0),
        }
    )

    return row


def _application_row(
    record: dict[str, Any],
) -> dict[str, Any]:
    extracted = (
        record.get("extracted")
        or
        {}
    )

    row = {
        key: ""
        for key in REPORT_COLUMNS
    }

    row.update(
        {
            "record_type": "APPLICATION",
            "filename":
                record.get("filename")
                or
                extracted.get("filename")
                or
                "",
            "queue_status":
                record.get("status")
                or
                "",
            "application_id":
                extracted.get("application_id"),
            "applicant":
                extracted.get("applicant"),
            "application_filename":
                extracted.get("filename"),
            "artwork_filename":
                extracted.get("artwork_filename"),
            "application_brand":
                extracted.get("brand_name"),
            "application_product_type":
                extracted.get("product_type"),
            "application_abv":
                extracted.get("abv"),
            "application_container_size":
                extracted.get("container_size"),
            "raw_text":
                extracted.get("raw_text"),
            "error":
                record.get("error"),
        }
    )

    return row


def _label_row(
    item: dict[str, Any],
) -> dict[str, Any]:
    payload = (
        item.get("payload")
        or
        {}
    )

    extracted = (
        payload.get("extracted")
        or
        {}
    )

    match = (
        payload.get("application_match")
        or
        {}
    )

    matched_application = (
        match.get("application")
        or
        {}
    )

    verification = (
        payload.get("verification")
        or
        {}
    )

    signals = (
        match.get("signals")
        or
        {}
    )

    row = {
        key: ""
        for key in REPORT_COLUMNS
    }

    row.update(
        {
            "record_type": "LABEL",
            "filename":
                item.get("filename")
                or
                payload.get("filename")
                or
                "",
            "queue_status":
                item.get("queue_status")
                or
                "",
            "receipt_number":
                payload.get("receipt_number"),
            "engine":
                payload.get("engine"),
            "processing_seconds":
                payload.get("processing_seconds"),
            "overall_status":
                verification.get("overall_status")
                or
                item.get("result_status"),
            "application_id":
                matched_application.get(
                    "application_id"
                ),
            "applicant":
                matched_application.get(
                    "applicant"
                ),
            "application_filename":
                matched_application.get(
                    "filename"
                ),
            "artwork_filename":
                matched_application.get(
                    "artwork_filename"
                ),
            "application_brand":
                matched_application.get(
                    "brand_name"
                ),
            "application_product_type":
                matched_application.get(
                    "product_type"
                ),
            "application_abv":
                matched_application.get(
                    "abv"
                ),
            "application_container_size":
                matched_application.get(
                    "container_size"
                ),
            "match_status":
                match.get("status"),
            "match_confidence":
                match.get("confidence"),
            "match_reason":
                match.get("reason"),
            "match_brand_signal":
                signals.get("brand"),
            "match_product_signal":
                signals.get("product"),
            "match_container_size_signal":
                signals.get(
                    "container_size"
                ),
            "match_abv_signal":
                signals.get("abv"),
            "match_alternatives":
                match.get("alternatives"),
            "label_brand":
                extracted.get("brand_name"),
            "label_product_type":
                extracted.get("product_type"),
            "label_abv":
                extracted.get("abv"),
            "label_container_size":
                extracted.get(
                    "container_size"
                ),
            "government_warning":
                extracted.get(
                    "government_warning"
                ),
            "warning_heading_uppercase":
                extracted.get(
                    "warning_heading_uppercase"
                ),
            "warning_heading_bold":
                extracted.get(
                    "warning_heading_bold"
                ),
            "extraction_confidence":
                extracted.get(
                    "extraction_confidence"
                ),
            "extraction_notes":
                extracted.get("notes"),
            "brand_check_status":
                verification.get(
                    "brand_status"
                ),
            "brand_check_detail":
                verification.get(
                    "brand_detail"
                ),
            "abv_check_status":
                verification.get(
                    "abv_status"
                ),
            "abv_check_detail":
                verification.get(
                    "abv_detail"
                ),
            "warning_check_status":
                verification.get(
                    "warning_status"
                ),
            "warning_check_detail":
                verification.get(
                    "warning_detail"
                ),
            "image_width":
                item.get("width"),
            "image_height":
                item.get("height"),
            "image_megapixels":
                item.get("megapixels"),
            "file_size_bytes":
                item.get("file_size_bytes"),
            "estimated_seconds":
                item.get("estimated_seconds"),
            "raw_text":
                extracted.get("raw_text"),
            "error":
                item.get("error"),
        }
    )

    return row


def build_rows(
    summary: dict[str, Any],
    applications: list[dict[str, Any]],
    items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = [
        _summary_row(summary)
    ]

    rows.extend(
        _application_row(record)
        for record in applications
    )

    rows.extend(
        _label_row(item)
        for item in items
    )

    return rows


def build_csv_report(
    summary: dict[str, Any],
    applications: list[dict[str, Any]],
    items: list[dict[str, Any]],
) -> bytes:
    output = io.StringIO(
        newline=""
    )

    writer = csv.DictWriter(
        output,
        fieldnames=REPORT_COLUMNS,
        extrasaction="ignore",
    )

    writer.writeheader()

    for row in build_rows(
        summary,
        applications,
        items,
    ):
        writer.writerow(
            {
                key:
                    _csv_safe(
                        row.get(key)
                    )
                for key in REPORT_COLUMNS
            }
        )

    return output.getvalue().encode(
        "utf-8-sig"
    )


def _pdf_safe(value: Any) -> str:
    text = _string(value)

    replacements = {
        "\u2018": "'",
        "\u2019": "'",
        "\u201c": '"',
        "\u201d": '"',
        "\u2013": "-",
        "\u2014": "-",
        "\u2022": "*",
        "\u2026": "...",
        "\u00a0": " ",
    }

    for source, target in replacements.items():
        text = text.replace(
            source,
            target,
        )

    return (
        text.encode(
            "latin-1",
            errors="replace",
        )
        .decode("latin-1")
    )


class _PdfWriter:
    PAGE_WIDTH = 612
    PAGE_HEIGHT = 792
    MARGIN_X = 42
    TOP_Y = 48
    BOTTOM_Y = 748

    def __init__(self):
        self.document = fitz.open()
        self.page = None
        self.y = self.TOP_Y
        self.page_number = 0
        self._new_page()

    def _new_page(self):
        self.page = self.document.new_page(
            width=self.PAGE_WIDTH,
            height=self.PAGE_HEIGHT,
        )

        self.page_number += 1
        self.y = self.TOP_Y

        self.page.insert_text(
            (
                self.MARGIN_X,
                self.PAGE_HEIGHT - 22,
            ),
            f"TTB Label Verification Report - Page {self.page_number}",
            fontsize=7,
            fontname="helv",
            color=(0.35, 0.35, 0.35),
        )

    def _ensure_space(
        self,
        line_height: float,
    ):
        if (
            self.y + line_height
            >
            self.BOTTOM_Y
        ):
            self._new_page()

    def blank(
        self,
        amount: float = 8,
    ):
        self._ensure_space(amount)
        self.y += amount

    def line(
        self,
        text: Any = "",
        *,
        size: float = 9,
        bold: bool = False,
        indent: float = 0,
        gap_after: float = 2,
        max_chars: int | None = None,
    ):
        safe = _pdf_safe(text)

        if max_chars is None:
            usable_width = (
                self.PAGE_WIDTH
                -
                (self.MARGIN_X * 2)
                -
                indent
            )

            max_chars = max(
                28,
                int(
                    usable_width
                    /
                    max(size * 0.54, 4.5)
                ),
            )

        # Preserve explicit OCR/PDF line breaks without passing embedded
        # newlines into insert_text(), because PyMuPDF would draw multiple
        # visual lines while this layout engine advanced Y only once.
        logical_lines = (
            safe.splitlines()
            or
            [""]
        )

        wrapped = []

        for logical_line in logical_lines:
            wrapped.extend(
                textwrap.wrap(
                    logical_line,
                    width=max_chars,
                    replace_whitespace=True,
                    drop_whitespace=True,
                    break_long_words=True,
                    break_on_hyphens=False,
                )
                or
                [""]
            )

        line_height = (
            size * 1.35
        )

        for segment in wrapped:
            self._ensure_space(
                line_height
            )

            self.page.insert_text(
                (
                    self.MARGIN_X
                    +
                    indent,
                    self.y,
                ),
                segment,
                fontsize=size,
                fontname=(
                    "hebo"
                    if bold
                    else
                    "helv"
                ),
                color=(0, 0, 0),
            )

            self.y += line_height

        self.y += gap_after

    def heading(
        self,
        text: Any,
        *,
        size: float = 13,
    ):
        self.blank(4)

        self.line(
            text,
            size=size,
            bold=True,
            gap_after=5,
        )

    def field(
        self,
        label: str,
        value: Any,
    ):
        rendered = (
            _string(value)
            if value not in (None, "")
            else
            "-"
        )

        self.line(
            f"{label}: {rendered}",
            size=8.5,
            gap_after=1,
        )

    def bytes(self) -> bytes:
        return self.document.tobytes(
            garbage=4,
            deflate=True,
        )


def build_pdf_report(
    summary: dict[str, Any],
    applications: list[dict[str, Any]],
    items: list[dict[str, Any]],
    generated_at: str | None = None,
) -> bytes:
    writer = _PdfWriter()

    if not generated_at:
        generated_at = (
            datetime.now(timezone.utc)
            .isoformat()
        )

    writer.line(
        "AI-Powered Alcohol Label Verification",
        size=18,
        bold=True,
        gap_after=3,
    )

    writer.line(
        "Batch Verification Report",
        size=13,
        bold=True,
        gap_after=6,
    )

    writer.field(
        "Generated",
        generated_at,
    )

    writer.heading(
        "Batch Summary",
        size=12,
    )

    writer.field(
        "Total label images",
        summary.get("total", 0),
    )

    writer.field(
        "PASS",
        summary.get("passed", 0),
    )

    writer.field(
        "FAIL",
        summary.get("failed", 0),
    )

    writer.field(
        "REVIEW",
        summary.get("review", 0),
    )

    writer.field(
        "SKIPPED",
        summary.get("skipped", 0),
    )

    writer.field(
        "ERROR",
        summary.get("errors", 0),
    )

    writer.field(
        "WAITING / not analyzed",
        summary.get("waiting", 0),
    )

    writer.heading(
        "Application Forms",
        size=12,
    )

    if not applications:
        writer.line(
            "No application forms are currently loaded.",
            size=8.5,
        )

    for position, record in enumerate(
        applications,
        start=1,
    ):
        extracted = (
            record.get("extracted")
            or
            {}
        )

        writer.heading(
            f"Application {position}",
            size=10.5,
        )

        writer.field(
            "File",
            record.get("filename"),
        )

        writer.field(
            "Status",
            record.get("status"),
        )

        writer.field(
            "Application ID",
            extracted.get(
                "application_id"
            ),
        )

        writer.field(
            "Applicant / permittee",
            extracted.get("applicant"),
        )

        writer.field(
            "Brand",
            extracted.get("brand_name"),
        )

        writer.field(
            "Class / type",
            extracted.get(
                "product_type"
            ),
        )

        writer.field(
            "ABV",
            extracted.get("abv"),
        )

        writer.field(
            "Container size",
            extracted.get(
                "container_size"
            ),
        )

        writer.field(
            "Artwork filename",
            extracted.get(
                "artwork_filename"
            ),
        )

        if record.get("error"):
            writer.field(
                "Error",
                record.get("error"),
            )

        writer.line(
            "Application extracted text:",
            size=8.5,
            bold=True,
            gap_after=1,
        )

        writer.line(
            extracted.get("raw_text")
            or
            "-",
            size=7.5,
            indent=8,
            gap_after=3,
        )

    writer.heading(
        "Label Results",
        size=12,
    )

    if not items:
        writer.line(
            "No label images are currently loaded.",
            size=8.5,
        )

    for position, item in enumerate(
        items,
        start=1,
    ):
        payload = (
            item.get("payload")
            or
            {}
        )

        extracted = (
            payload.get("extracted")
            or
            {}
        )

        match = (
            payload.get(
                "application_match"
            )
            or
            {}
        )

        matched_application = (
            match.get("application")
            or
            {}
        )

        verification = (
            payload.get("verification")
            or
            {}
        )

        signals = (
            match.get("signals")
            or
            {}
        )

        writer.heading(
            f"Label {position}: "
            f"{item.get('filename') or payload.get('filename') or 'Label'}",
            size=10.5,
        )

        writer.field(
            "Queue status",
            item.get("queue_status"),
        )

        writer.field(
            "Result",
            verification.get(
                "overall_status"
            )
            or
            item.get("result_status"),
        )

        writer.field(
            "Receipt",
            payload.get(
                "receipt_number"
            ),
        )

        writer.field(
            "Engine",
            payload.get("engine"),
        )

        writer.field(
            "Processing seconds",
            payload.get(
                "processing_seconds"
            ),
        )

        writer.field(
            "Image dimensions",
            (
                f"{item.get('width')} x "
                f"{item.get('height')}"
                if (
                    item.get("width")
                    and
                    item.get("height")
                )
                else
                "-"
            ),
        )

        writer.field(
            "Image megapixels",
            item.get("megapixels"),
        )

        writer.line(
            "Extracted label fields",
            size=9,
            bold=True,
            gap_after=2,
        )

        writer.field(
            "Brand",
            extracted.get("brand_name"),
        )

        writer.field(
            "Product type",
            extracted.get(
                "product_type"
            ),
        )

        writer.field(
            "ABV",
            extracted.get("abv"),
        )

        writer.field(
            "Container size",
            extracted.get(
                "container_size"
            ),
        )

        writer.field(
            "Government warning",
            extracted.get(
                "government_warning"
            ),
        )

        writer.field(
            "Warning heading uppercase",
            extracted.get(
                "warning_heading_uppercase"
            ),
        )

        writer.field(
            "Warning heading bold",
            extracted.get(
                "warning_heading_bold"
            ),
        )

        writer.field(
            "Extraction confidence",
            extracted.get(
                "extraction_confidence"
            ),
        )

        writer.field(
            "Extraction notes",
            extracted.get("notes"),
        )

        writer.line(
            "Application match",
            size=9,
            bold=True,
            gap_after=2,
        )

        writer.field(
            "Match status",
            match.get("status"),
        )

        writer.field(
            "Match confidence",
            (
                f"{match.get('confidence')}%"
                if match.get(
                    "confidence"
                )
                is not None
                else
                "-"
            ),
        )

        writer.field(
            "Match reason",
            match.get("reason"),
        )

        writer.field(
            "Matched application ID",
            matched_application.get(
                "application_id"
            ),
        )

        writer.field(
            "Matched application brand",
            matched_application.get(
                "brand_name"
            ),
        )

        writer.field(
            "Matched application type",
            matched_application.get(
                "product_type"
            ),
        )

        writer.field(
            "Matched application ABV",
            matched_application.get(
                "abv"
            ),
        )

        writer.field(
            "Matched application size",
            matched_application.get(
                "container_size"
            ),
        )

        writer.field(
            "Match signals",
            signals,
        )

        writer.field(
            "Alternative matches",
            match.get(
                "alternatives"
            ),
        )

        writer.line(
            "Verification checks",
            size=9,
            bold=True,
            gap_after=2,
        )

        writer.field(
            "Brand check",
            (
                f"{verification.get('brand_status') or '-'} - "
                f"{verification.get('brand_detail') or '-'}"
            ),
        )

        writer.field(
            "ABV check",
            (
                f"{verification.get('abv_status') or '-'} - "
                f"{verification.get('abv_detail') or '-'}"
            ),
        )

        writer.field(
            "Government warning check",
            (
                f"{verification.get('warning_status') or '-'} - "
                f"{verification.get('warning_detail') or '-'}"
            ),
        )

        if item.get("error"):
            writer.field(
                "Error",
                item.get("error"),
            )

        writer.line(
            "Label extracted raw text:",
            size=8.5,
            bold=True,
            gap_after=1,
        )

        writer.line(
            extracted.get("raw_text")
            or
            "-",
            size=7.5,
            indent=8,
            gap_after=5,
        )

    return writer.bytes()
