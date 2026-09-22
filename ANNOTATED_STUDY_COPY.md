# Annotated Study Copy

**Prepared by John Russell**

This folder is a teaching/rehearsal copy of the Treasury TTB Label Verifier.

The Python modules contain intentionally dense comments above each function and logical statement/block. The browser JavaScript contains its existing section comments plus a purpose comment above every named function. This is deliberately more commentary than would normally be kept in production source code.

Use this copy to rehearse the application flow:

1. FastAPI receives the upload/request.
2. Application PDFs are parsed into structured candidate records.
3. The selected vision/OCR engine extracts structured label fields.
4. The matching engine ranks candidate applications.
5. The validation engine applies deterministic brand, ABV, and warning checks.
6. Ambiguous pairings/results are routed to REVIEW.
7. The browser renders batch status, result cards, and optional voice output.

The clean submission package was intentionally left unchanged so the reviewer-facing repository is not overwhelmed by tutorial-style comments.
