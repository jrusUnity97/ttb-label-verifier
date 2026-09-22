# ANNOTATED STUDY COPY

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

## RUNTIME ENVIRONMENT NOTE

- Local development uses Ollama for Gemma/Qwen vision inference and can use local Tesseract/Kokoro.
- The Railway deployment uses OpenRouter for hosted vision inference because Railway cannot access a workstation's local Ollama service.
- Tesseract is installed in the Railway Docker image.
- Server-side Kokoro voice can be slower on Railway CPU resources; browser speech is available as a fallback. Voice is not part of the PASS / FAIL / REVIEW decision path.

