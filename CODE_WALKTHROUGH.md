# TTB Label Verifier - Code Walkthrough

**Prepared by John Russell**

This document provides a technical walkthrough of the take-home prototype. The application uses **separation of concerns** so the browser structure, client-side behavior, extraction engines, deployment path, and deterministic validation can be reviewed independently.

## 1. File map

```text
ttb-label-verifier/
├── app.py                    FastAPI application and HTTP/API routes
├── application_parser.py     Extracts structured data from application PDFs
├── engines.py                Local/hosted vision and OCR extraction logic
├── matching.py               Scores label-to-application candidates
├── validation.py             Deterministic PASS / FAIL / REVIEW rules
├── tts.py                    Optional text-to-speech support
├── models.py                 Shared data structures / models
├── Dockerfile                Railway/container runtime
├── railway.json              Railway start-command configuration
├── templates/
│   └── index.html            Page structure only
└── static/
    ├── styles.css            Layout and visual styling
    └── app.js                Browser state, events, API calls, and rendering
```

## 2. The simplest architecture explanation

The application deliberately separates **AI extraction** from **business-rule validation**.

1. The browser uploads application PDFs and label images.
2. `app.py` receives the request.
3. `application_parser.py` extracts expected application values from PDFs.
4. `engines.py` reads the label with the selected local/hosted vision engine or Tesseract OCR.
5. `matching.py` identifies the most likely application for that label.
6. `validation.py` compares expected vs. observed values using deterministic rules and returns PASS, FAIL, or REVIEW.
7. `app.py` returns structured JSON.
8. `static/app.js` updates progress, results, queue state, details, and optional voice output.

The model reads messy visual content, but it **does not make the final compliance decision**. Normal Python rules make the final comparison easier to test and explain.

## 3. Local vs. hosted inference

The project intentionally supports two runtime environments without changing the browser workflow.

### Local workstation

When `OPENROUTER_API_KEY` is absent:

```text
Browser -> FastAPI -> Ollama -> Gemma 3 / Qwen2.5-VL
                  -> Tesseract OCR
                  -> deterministic validation
```

Local model setup uses:

```powershell
ollama pull gemma3:4b
ollama pull qwen2.5vl:7b
```

This path avoids hosted-model API costs and is useful for development and testing on a workstation with suitable hardware.

### Railway deployment

When `OPENROUTER_API_KEY` is present:

```text
Reviewer browser -> Railway/FastAPI -> OpenRouter -> Gemma 3 / Qwen2.5-VL
                                   -> containerized Tesseract
                                   -> deterministic validation
```

Railway cannot reach an Ollama process running on a developer workstation, so the hosted deployment switches Gemma/Qwen inference to OpenRouter. The UI and engine keys stay the same; only the inference transport changes.

Recommended Railway variables are:

```text
OPENROUTER_API_KEY=<secret>
OPENROUTER_GEMMA_MODEL=google/gemma-3-4b-it
OPENROUTER_QWEN_MODEL=qwen/qwen2.5-vl-72b-instruct
```

The larger hosted Qwen endpoint is used because the smaller 7B OpenRouter route was not consistently available during deployment testing. Secrets remain in Railway variables rather than source control.

## 4. Why JavaScript was separated from HTML

Previously, `templates/index.html` included a large amount of embedded JavaScript. Moving browser behavior into `static/app.js` gives each file one primary responsibility:

- HTML = structure
- CSS = appearance
- JavaScript = browser behavior
- Python = backend processing

The move does not change the backend contract.

## 5. Backend request flow

### `GET /`
Renders `templates/index.html` and makes the main interface available.

### `POST /api/extract-application`
Accepts an application PDF, reads the bytes, and calls `extract_application_pdf()` in a thread pool because PDF parsing is blocking work. The endpoint returns structured application metadata as JSON.

### `POST /api/analyze-one`
The main single-label pipeline is:

```text
image upload
    -> extract label fields with selected engine
    -> match against loaded applications
    -> validate expected vs. observed fields
    -> create receipt number
    -> return JSON result
```

The browser can call this endpoint repeatedly using multiple workers when parallel processing is selected.

### `POST /api/speak`
The browser sends text to the backend for optional Kokoro speech generation. If server-side generation is unavailable or playback fails, client-side browser speech can be used as a fallback.

## 6. Hosted voice latency

Voice is intentionally non-critical to the verification pipeline. In the Railway deployment, Kokoro runs on CPU resources. Model initialization, CPU synthesis, and the network round trip can make the first request noticeably slower than local execution. A warm process may respond faster, but the hosted demo should not depend on immediate server-side speech.

The browser speech API remains available as a fallback. Whether voice is fast or slow does **not** change OCR/vision extraction, application matching, or PASS / FAIL / REVIEW results.

## 7. Frontend (`static/app.js`) mental model

The JavaScript is wrapped in an IIFE so internal variables do not leak into the global browser namespace.

The major sections are:

1. **DOM references** - caches buttons, inputs, status elements, and panels.
2. **Application state** - queue, loaded forms, processing flags, counters.
3. **Configuration helpers** - selected engine, mode, concurrency, ETA.
4. **Queue rendering** - grid/details views and selected-item state.
5. **Application-form loading** - drag/drop, PDF parsing, duplicate checks.
6. **Image loading** - validates and queues JPG/PNG files.
7. **Processing** - claims work, calls `/api/analyze-one`, handles responses.
8. **Result rendering** - PASS/FAIL/REVIEW cards and extracted evidence.
9. **Voice output** - server speech plus browser fallback.
10. **Event listeners** - connects user actions to functions.
11. **Initialization** - renders the initial state and estimates.

## 8. Sequential vs. parallel processing

Sequential mode uses one worker. Parallel mode creates multiple browser-side workers. Each worker claims the next WAITING queue item before sending the request, preventing two workers from claiming the same label.

```text
Worker 1 -> claim item -> analyze -> repeat
Worker 2 -> claim item -> analyze -> repeat
Worker 3 -> claim item -> analyze -> repeat
```

## 9. Matching logic

Matching and validation are intentionally different steps. A label should still match the correct application even when one field is wrong. For example, an incorrect label ABV should not dominate matching and cause the system to select a different application. After matching, validation determines whether the fields actually agree.

Ambiguous matches are routed to **REVIEW** rather than forcing a confident answer.

## 10. Why thread-pool calls appear in FastAPI

FastAPI's event loop is efficient for asynchronous I/O, but OCR, local model calls, PDF parsing, and speech synthesis may be blocking operations. The application uses Starlette's `run_in_threadpool()` around blocking work so one slow operation does not unnecessarily freeze the server event loop.

## 11. Error-handling philosophy

The application exposes uncertainty instead of hiding it:

- empty or malformed uploads -> controlled error
- engine exception -> visible error for that queue item
- missing required extraction -> REVIEW or FAIL depending on the rule
- ambiguous application match -> REVIEW
- TTS unavailable -> browser voice fallback

A take-home prototype should not pretend uncertain AI output is certain.

## 12. What I would change for production

The current code is a prototype, not an enterprise deployment. A production version would add authentication/authorization, persistent storage, malware/file validation, retention controls, structured audit logging, a durable job queue, model/version pinning, regression evaluation, observability, rate limiting, and integration with authoritative TTB systems.

## 13. Short interview explanation

> The application uses AI/OCR for extraction but not for the final compliance decision. FastAPI accepts the uploaded label and application data, the selected extraction engine produces structured fields, a matching layer finds the most likely application, and deterministic Python validation compares fields such as brand, ABV, and warning requirements. Locally, vision inference runs through Ollama. In the Railway deployment, the same engine choices use OpenRouter because the hosted service cannot access a workstation's Ollama instance. Tesseract runs inside the container. The frontend maintains the batch queue and can process requests sequentially or with multiple workers. Voice is optional and kept separate from the decision path.


## Hosted model fallback behavior

The hosted OpenRouter path uses a bounded fallback chain so a transient provider rate limit does not automatically fail a reviewer request. The selected model is attempted first. Retryable availability errors (`404`, `429`, and selected transient `5xx` responses) move to the next configured multimodal model. Authentication and malformed-request errors are not hidden by model fallback.

When a fallback model handles the request, its model ID is added to the extraction notes. Matching and deterministic validation are unchanged.


## Batch reset behavior

The browser owns the in-session application and image queues. Reviewers can remove individual application PDFs, remove the selected label image, or clear either entire input collection. Destructive input changes invalidate prior analysis output because those results were computed against the previous input set. Image preview object URLs are revoked when images are removed so repeated batches do not accumulate browser memory.
