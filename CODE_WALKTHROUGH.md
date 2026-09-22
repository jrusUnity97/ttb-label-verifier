# TTB Label Verifier - Code Walkthrough

**Prepared by John Russell**

This document provides a technical walkthrough of the take-home prototype. The application uses
**separation of concerns** so the browser structure, client-side behavior, and backend processing
can be reviewed independently.

## 1. File map

```text
ttb-label-verifier/
├── app.py                    FastAPI application and HTTP/API routes
├── application_parser.py     Extracts structured data from application PDFs
├── engines.py                Vision/OCR engine adapters and extraction logic
├── matching.py               Scores label-to-application candidates
├── validation.py             Deterministic PASS / FAIL / REVIEW rules
├── tts.py                    Optional text-to-speech support
├── models.py                 Shared data structures / models
├── templates/
│   └── index.html            Page structure only
└── static/
    ├── styles.css            Layout and visual styling
    └── app.js                Browser state, events, API calls, and rendering
```

## 2. The simplest architecture explanation

The application deliberately separates **AI extraction** from **business-rule
validation**.

1. The browser uploads application PDFs and label images.
2. `app.py` receives the request.
3. `application_parser.py` extracts expected application values from PDFs.
4. `engines.py` uses the selected vision/OCR engine to read the label.
5. `matching.py` identifies the most likely application for that label.
6. `validation.py` compares expected vs. observed values using deterministic
   rules and returns PASS, FAIL, or REVIEW.
7. `app.py` returns structured JSON.
8. `static/app.js` updates progress, result cards, queue state, details, and
   optional voice output in the browser.

That distinction is important: the model reads messy visual content, but it
**does not make the final compliance decision**. Normal Python rules make the
final comparison easier to test and explain.

## 3. Why JavaScript was separated from HTML

Previously, `templates/index.html` included roughly 3,500 lines of embedded
JavaScript. It worked, but made the page difficult to study and maintain.

The revised version uses:

```html
<link rel="stylesheet" href="/static/styles.css">
...
<script src="/static/app.js"></script>
```

This gives each file one primary responsibility:

- HTML = structure
- CSS = appearance
- JavaScript = browser behavior
- Python = backend processing

No Jinja variables were used inside the original JavaScript, so the move to an
external file does not change the backend contract.

## 4. Backend request flow

### `GET /`
Renders `templates/index.html` and makes the main interface available.

### `POST /api/extract-application`
Accepts an application PDF, reads the bytes, and calls
`extract_application_pdf()` in a thread pool because PDF parsing is blocking
work. The endpoint returns structured application metadata as JSON.

### `POST /api/analyze-one`
This is the main single-label pipeline:

```text
image upload
    -> extract label fields with selected engine
    -> match against loaded applications
    -> validate expected vs. observed fields
    -> create receipt number
    -> return JSON result
```

The browser can call this endpoint repeatedly using multiple workers when the
user selects parallel processing.

### Text-to-speech endpoint
The browser sends summary text to the backend. If server-side speech generation
is unavailable, the JavaScript can fall back to the browser speech API.

## 5. Frontend (`static/app.js`) mental model

The JavaScript is an IIFE (Immediately Invoked Function Expression):

```javascript
(() => {
    // application state, functions, event listeners, initialization
})();
```

That keeps internal variables out of the global browser namespace.

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
10. **Event listeners** - connects user actions to the functions above.
11. **Initialization** - renders the initial empty state and estimates.

## 6. Sequential vs. parallel processing

Sequential mode effectively uses one worker. Parallel mode creates multiple
browser-side workers. Each worker claims the next WAITING queue item and sends
it to the same backend endpoint.

Conceptually:

```text
Worker 1 -> claim item -> analyze -> repeat
Worker 2 -> claim item -> analyze -> repeat
Worker 3 -> claim item -> analyze -> repeat
```

The queue item is marked before the asynchronous request begins, which prevents
two workers from claiming the same label.



## 7. Matching logic

Matching and validation are intentionally different steps.

A label should still match the correct application even when one field is wrong.
For example, if the label's ABV is incorrect, ABV should not dominate matching
and cause the system to select a completely different application. After the
most likely application is identified, validation determines whether the fields
actually agree.

Ambiguous matches are routed to **REVIEW** rather than forcing a confident
answer.

## 8. Why thread-pool calls appear in FastAPI

FastAPI's event loop is good for asynchronous I/O, but OCR, local model calls,
PDF parsing, and speech synthesis may be blocking operations. The application
uses Starlette's `run_in_threadpool()` around blocking work so one slow operation
does not unnecessarily freeze the web server's event loop.

## 9. Error-handling philosophy

The application tries to expose uncertainty instead of hiding it:

- empty or malformed uploads -> controlled error
- engine exception -> visible error for that queue item
- missing required extraction -> REVIEW or FAIL depending on the rule
- ambiguous application match -> REVIEW
- TTS unavailable -> browser voice fallback

A take-home prototype should not pretend uncertain AI output is certain.

## 10. What I would change for production

The current code is a prototype, not an enterprise deployment. A production
version would add authentication/authorization, persistent storage, malware and
file validation, retention controls, structured audit logging, a durable job
queue, model/version pinning, regression evaluation, observability, and
integration with authoritative TTB systems.

## 11. Short interview explanation

> The application uses AI/OCR for extraction, but not for the final decision.
> FastAPI accepts the uploaded label and application data, the selected engine
> extracts structured fields from the image, a matching layer finds the most
> likely application, and deterministic Python validation compares fields such
> as brand, ABV, and warning requirements. The frontend maintains the batch
> queue and can run requests sequentially or with multiple workers. I separated
> the JavaScript from the HTML so the page structure, presentation, browser
> logic, and backend logic each have a clear responsibility.


## Hosted deployment

The same engine keys work in two environments. If `OPENROUTER_API_KEY` is configured, `engines.py` sends the uploaded image to the selected hosted Gemma/Qwen endpoint. If the key is absent, it preserves the local Ollama path. Railway builds from the root `Dockerfile`, which pins Python 3.12 and installs Tesseract so OCR does not depend on a Windows installation. Secrets remain in Railway variables rather than source control.
