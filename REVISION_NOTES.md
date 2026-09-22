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
