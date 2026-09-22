# Revision Notes

**Prepared by John Russell**

## Structural revision

- Moved all embedded browser JavaScript out of `templates/index.html`.
- Added `static/app.js`.
- `index.html` now loads JavaScript with `<script src="/static/app.js"></script>`.
- Kept the script at the end of `<body>` so initialization order is unchanged.
- Preserved the existing `/static` FastAPI mount, so no new backend route was
  required.
- Preserved existing API endpoint names and request/response behavior.

## Comments

- Python modules retain the annotated study-copy comments.
- JavaScript retains the section comments and purpose comments above named
  functions.
- Added a file-level JavaScript explanation of responsibilities and IIFE scope.
- Added `CODE_WALKTHROUGH.md` for interview rehearsal.

## Intent

This is a readability/refactoring change, not a feature rewrite. The goal is to
make the code easier to explain without changing the working application flow.

## Numbered workflow UI

- Added a compact workflow guide to the left results sidebar.
- Numbered the actionable interface sections from Step 1 through Step 7.
- Reordered the right-side controls to follow the same workflow sequence.
- Added clickable workflow links that scroll to the corresponding section.
- Kept automatic application matching as supporting information rather than presenting it as a manual user step.

## Subtle hover gloss

- Added a non-interactive glossy overlay to the major UI windows on mouse hover.
- The effect does not resize, lift, or move panels and does not intercept clicks.
- Touch devices are excluded from the hover effect to avoid sticky hover states.

## Context tooltip update

- Added hover/focus `?` tooltips to the major workflow windows.
- Application Forms and Label Images tooltips explicitly explain click/browse and drag-and-drop behavior.
- Each AI/OCR engine now has a tooltip describing its purpose, relative speed estimate used by the prototype ETA, and hardware-dependent caveats.
- Added explanations for Batch Mode, Analyze controls, Results, Batch Queue, Extracted Details, Current Processing, and Automatic Application Match.
- Kept the existing subtle gloss hover effect.

## Stronger hover emphasis

- Increased the panel gloss visibility on pointer hover.
- Added a slightly darker border and restrained shadow to major windows.
- Strengthened panel headings and interactive-card text on hover.
- Added clearer hover treatment to upload zones, engine/mode cards, queue/results cards, and buttons.
- Hover states remain stationary: no scaling or layout movement was introduced.

## Control layout gap fix

- Kept the page title/header open and unboxed.
- Reworked the lower right-side controls into two independent vertical stacks.
- `Analyze` now sits directly below `Batch Mode` instead of leaving a large empty grid gap caused by the taller AI/OCR engine panel.
- `Automatic Application Match` remains directly below the AI/OCR engine panel.

## Compact engine/status UI refinement

- Changed the PASS / FAIL / REVIEW summary counters from rounded pills to equal square status tiles.
- Reduced vertical padding, spacing, and typography slightly in the AI/OCR engine choices so all engines occupy less vertical space without removing descriptions or tooltips.

- Results header refined: PASS / FAIL / REVIEW square counters now use a full-width, evenly spaced row beneath the title for a cleaner layout.

## Reviewer attribution header

- Added a small, visible `Prepared by John Russell` attribution in the upper-right page header.
- Kept attribution visually secondary to the application title and workflow controls.
- On narrow screens, the attribution moves above the header action buttons without changing functionality.


## OpenRouter endpoint reliability update

- Switched hosted Gemma 3 and Qwen2.5-VL defaults from `:free` routes to the standard paid model IDs.
- This avoids deployment failures when a free route is listed in the catalog but has no active provider endpoint.
- Railway still uses the same `OPENROUTER_API_KEY`; no new secret is required.

## Hosting and local-installation documentation update

- Reworked `README.md` to clearly separate **local workstation** and **hosted Railway** runtime modes.
- Added a complete local installation path using Python 3.12, a virtual environment, Ollama, Tesseract, optional Kokoro, and Uvicorn.
- Documented the hosted architecture: GitHub -> Railway/Docker -> OpenRouter for Gemma/Qwen vision inference, with Tesseract installed inside the container.
- Documented Railway environment variables and the use of paid/stable OpenRouter model endpoints.
- Changed the hosted Qwen default to `qwen/qwen2.5-vl-72b-instruct` because the smaller hosted 7B route was not reliably available during deployment testing.
- Added an explicit note that Railway CPU resources can make server-side Kokoro synthesis noticeably slower, especially on first use/cold start; browser speech remains a fallback.
- Clarified that voice latency does not affect label extraction, matching, or PASS / FAIL / REVIEW decisions.



## Upload-panel gap fix

- Reworked the right-side workflow into two independent full-height desktop stacks.
- Application Forms can now grow as uploaded PDFs are listed without reserving matching blank space below Label Images.
- Label Images flows directly into Batch Mode and Analyze on the right side.
- The left side flows Application Forms -> AI/OCR Engine -> Automatic Application Match.
- Narrow screens still restore the numbered workflow order: Steps 1 through 5, followed by matching guidance.


## Server-side voice restored

- Reverted the hosted voice path to the original FastAPI `/api/speak` flow.
- Railway again performs Kokoro ONNX synthesis with the `bm_george` British male voice.
- Removed the browser WebGPU/Kokoro execution path from the active application.
- The Docker build now downloads the Kokoro model assets so hosted speech is available after deployment.
- Railway CPU synthesis can be slower than local execution; that latency is documented as a deployment trade-off.
