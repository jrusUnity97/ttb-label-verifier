# ALCOHOL LABEL VERIFICATION PROTOTYPE USING MULTIMODAL VISION, OCR, AND DETERMINISTIC VALIDATION

**Prepared by John Russell**

A take-home prototype for AI-assisted alcohol label review. The application accepts alcohol-label images and application-form PDFs, extracts structured information, matches each label to the most likely application, and returns field-level and overall **PASS / FAIL / REVIEW** results.

> **Prototype notice:** This tool is a demonstration and does not make official TTB approvals, COLA determinations, or legal decisions. Ambiguous or low-confidence cases are intentionally routed to human review.

## RUNTIME MODES

The same application supports both local development and hosted review.

| Environment | Vision inference | OCR | Voice |
|---|---|---|---|
| Local workstation | Ollama running Gemma 3 or Qwen2.5-VL | Local Tesseract | Local Kokoro ONNX, with browser fallback |
| Railway deployment | OpenRouter-hosted Gemma 3 or Qwen2.5-VL | Tesseract installed in the Docker image | Kokoro/browser speech; CPU hosting can introduce noticeable synthesis delay |

The business-rule layer is the same in both environments. AI/OCR extracts label information; normal Python validation makes the final **PASS / FAIL / REVIEW** decision.

---

## LOCAL INSTALLATION AND RUN INSTRUCTIONS

### PREREQUISITES

- Windows 10/11
- Python 3.12 recommended
- Ollama installed and running for local vision-model inference
- Tesseract OCR installed if the Tesseract engine will be used
- Git is optional unless cloning/pushing the repository from the command line

### 1. OBTAIN THE PROJECT

Clone the repository or download/extract the project folder. Open PowerShell in the project root, where `app.py`, `requirements.txt`, `templates/`, and `static/` are located.

### 2. CREATE AND ACTIVATE A VIRTUAL ENVIRONMENT

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. INSTALL PYTHON DEPENDENCIES

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. INSTALL THE LOCAL VISION MODELS

For local AI vision mode, install at least one supported Ollama model:

```powershell
ollama pull gemma3:4b
ollama pull qwen2.5vl:7b
```

The application uses local Ollama automatically when `OPENROUTER_API_KEY` is not present.

### 5. CONFIGURE TESSERACT OCR

If Tesseract is installed, the application attempts to locate `tesseract.exe` automatically. It checks Windows `PATH`, standard Program Files locations, and a common per-user install location.

If Tesseract is installed somewhere else, set the path before starting the app:

```powershell
$env:TESSERACT_CMD = "C:\Path\To\Tesseract-OCR\tesseract.exe"
```

No edit to `engines.py` is required.

### 6. OPTIONAL LOCAL VOICE SETUP

The project includes optional Kokoro ONNX speech output. Download the required model files with:

```powershell
python download_kokoro_models.py
```

If Kokoro is unavailable, the browser speech engine can be used as a fallback.

### 7. START THE APPLICATION

```powershell
python -m uvicorn app:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

### OPTIONAL WINDOWS SETUP HELPER

A convenience script is also provided:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_windows.ps1
```

After changing Ollama parallel-processing settings, fully restart Ollama before testing parallel batches.

---

## HOSTED DEPLOYMENT: RAILWAY + OPENROUTER

The public demo is designed to deploy from GitHub to Railway. Railway builds the application from the included root `Dockerfile`, which:

- uses Python 3.12,
- installs the Tesseract executable inside the container,
- installs the Python dependencies from `requirements.txt`, and
- starts FastAPI/Uvicorn on Railway's assigned `$PORT`.

The included `railway.json` defines the Uvicorn start command so the service launches `app:app` explicitly.

### HOSTED VISION INFERENCE

Railway cannot access Ollama running on a developer workstation. For that reason, the deployed application switches the same Gemma/Qwen UI choices to OpenRouter-hosted multimodal inference whenever `OPENROUTER_API_KEY` is configured.

Configure these Railway service variables:

```text
OPENROUTER_API_KEY=<secret API key>
OPENROUTER_GEMMA_MODEL=google/gemma-3-4b-it
OPENROUTER_QWEN_MODEL=qwen/qwen2.5-vl-72b-instruct
```

Optional fallback overrides:

```text
OPENROUTER_GEMMA_FALLBACK_MODEL=google/gemma-3-12b-it
OPENROUTER_GEMMA_SECOND_FALLBACK_MODEL=qwen/qwen2.5-vl-72b-instruct
OPENROUTER_QWEN_FALLBACK_MODEL=google/gemma-3-12b-it
OPENROUTER_QWEN_SECOND_FALLBACK_MODEL=google/gemma-3-4b-it
```

The Qwen hosted default uses the 72B endpoint because the smaller Qwen2.5-VL 7B OpenRouter route was not consistently available during deployment testing. Local development still uses the lighter `qwen2.5vl:7b` Ollama model.

Secrets are stored only as Railway environment variables and are not committed to source control. A low API-key spending cap is appropriate for this demonstration deployment.


### HOSTED MODEL AVAILABILITY AND AUTOMATIC FALLBACK

OpenRouter providers can occasionally return transient capacity or availability errors such as HTTP `429`, `404`, or selected `5xx` responses. The public demo therefore uses a bounded fallback chain instead of failing immediately:

- **Gemma 3 Vision selected:** configured Gemma primary -> Gemma 3 12B -> Qwen2.5-VL 72B.
- **Qwen2.5-VL selected:** configured Qwen primary -> Gemma 3 12B -> Gemma 3 4B.

Fallback is used only for provider/routing availability failures. Authentication and malformed-request errors are surfaced immediately. When a fallback model is used, the extraction notes record which hosted model actually handled the request.

This changes only the hosted extraction route. Application matching and deterministic **PASS / FAIL / REVIEW** validation are unchanged.

### HOSTED VOICE BEHAVIOR

Voice is an optional usability feature, not part of the compliance decision path. On Railway, server-side Kokoro synthesis runs on CPU resources and may have a noticeable delay, especially on the first request or after a cold start. The browser speech API remains available as a fallback and may respond faster in the hosted environment.

This latency does **not** affect label extraction, application matching, or **PASS / FAIL / REVIEW** logic.

---

## APPROACH

The application separates **AI-assisted extraction** from **deterministic verification**.

```text
Application PDF -> PDF parser -> Structured application data
                                      |
                                      v
Label image -> Vision/OCR engine -> Structured label data
                                      |
                                      v
                            Application matching
                                      |
                         +------------+------------+
                         |                         |
                     MATCHED               UNCERTAIN / UNMATCHED
                         |                         |
                         v                         v
                 Deterministic rules          Human review
                         |
                         v
                 PASS / FAIL / REVIEW
```

### 1. APPLICATION-FORM EXTRACTION

`application_parser.py` uses PyMuPDF to read text-based application PDFs and extract fields such as application ID, brand name, product/class, ABV, and container size.

### 2. LABEL EXTRACTION

`engines.py` supports multiple extraction approaches:

- Gemma 3 Vision through local Ollama or a hosted OpenRouter vision endpoint
- Qwen2.5-VL through local Ollama or a hosted OpenRouter vision endpoint
- Tesseract OCR with image preprocessing

When `OPENROUTER_API_KEY` is present, Gemma/Qwen requests are sent to the configured hosted models. Without that variable, the same engine choices use local Ollama. The models extract structured label information; they are **not** asked to make the final compliance decision.

### 3. APPLICATION MATCHING

`matching.py` compares the extracted label information against uploaded applications. Brand, product/class, container size, and ABV contribute to a weighted score.

A confident match proceeds to validation. Ambiguous or weak matches become **REVIEW** rather than being guessed.

### 4. DETERMINISTIC VALIDATION

`validation.py` performs the final field checks. The prototype evaluates:

- Brand name
- Alcohol by volume (ABV)
- Government warning text and visible warning-heading characteristics when detectable

The overall result is conservative:

- Any required field that clearly fails -> **FAIL**
- Any unresolved or uncertain required field -> **REVIEW**
- All required checks pass -> **PASS**

### 5. BROWSER INTERFACE

The UI is intentionally implemented without a separate front-end framework so the project remains easy to run and review.

- `templates/index.html` contains page structure.
- `static/styles.css` contains presentation and layout.
- `static/app.js` contains browser behavior, uploads, batch processing, API calls, result rendering, and review controls.
- Context tooltips explain upload behavior, batch controls, matching, results, and per-engine trade-offs without permanently cluttering the dashboard.

Dynamic OCR/model/file content is treated as untrusted output and escaped before it is inserted into generated HTML.

### 6. OPTIONAL VOICE OUTPUT

The **Test Voice** button lets a reviewer confirm audio output before running a batch. Local installations can use Kokoro ONNX directly. The hosted deployment can also attempt server-side Kokoro, but CPU-only synthesis may be slower; browser speech is retained as a fallback.

Voice is intentionally separate from the verification pipeline and does **not** influence OCR/vision extraction, application matching, or **PASS / FAIL / REVIEW** decisions.

---

## TOOLS USED

| Area | Tool / Library | Purpose |
|---|---|---|
| Backend API | FastAPI | HTTP routes, file uploads, and request orchestration |
| Templates | Jinja2 | Serves the browser interface |
| Front end | HTML / CSS / JavaScript | Upload, batch, review, and result UI |
| Local AI inference | Ollama | Runs multimodal models on a local workstation |
| Hosted AI inference | OpenRouter | Provides hosted multimodal model access for the Railway demo |
| Hosting | Railway + Docker | Builds and serves the public FastAPI deployment |
| Vision models | Gemma 3 / Qwen2.5-VL | Extracts structured information from label images |
| OCR | Tesseract + OpenCV | OCR and image preprocessing |
| PDF parsing | PyMuPDF | Reads application-form PDF text |
| Data validation | Pydantic / Python | Structured request and result data |
| Speech | Kokoro ONNX / browser speech | Optional status and batch-summary audio |

---

## PROJECT STRUCTURE

```text
app.py                    FastAPI routes and main request orchestration
application_parser.py     Application-PDF field extraction
engines.py                Local/hosted vision and OCR extraction engines
matching.py               Label-to-application matching logic
validation.py             PASS / FAIL / REVIEW rules
models.py                 Pydantic data structures
tts.py                    Optional speech generation
requirements.txt          Python dependencies
Dockerfile                Railway/container runtime definition
railway.json              Railway start-command configuration
setup_windows.ps1         Windows setup helper
download_kokoro_models.py Optional local voice-model downloader

templates/
  index.html              Browser page structure

static/
  styles.css              UI styling
  app.js                  Browser logic and API interaction
```

---

## ASSUMPTIONS AND LIMITATIONS

- The prototype is a **decision-support tool**, not an official regulatory approval system.
- Application PDFs are assumed to be text-based. Scanned PDFs would require an OCR fallback.
- Label images must contain enough visible information for the selected OCR or vision engine to extract relevant fields.
- AI/model output is probabilistic, so uncertain extraction or matching results are routed to **REVIEW**.
- A human reviewer is assumed to be available for ambiguous cases.
- Local development uses Ollama unless a hosted OpenRouter key is intentionally configured.
- The Railway demo uses OpenRouter because the hosted server cannot access a developer's local Ollama service.
- Hosted model availability, latency, and cost depend on the selected OpenRouter provider/model endpoint.
- Railway CPU resources can make server-side Kokoro voice synthesis noticeably slower than local execution or browser speech.
- Batch processing demonstrates sequential and parallel workflows but is not a production-scale distributed job system.
- Performance varies by model, image quality, CPU/GPU hardware, network latency, and concurrency level.
- The prototype does not implement enterprise authentication, RBAC, persistent audit storage, malware scanning, or integration with authoritative TTB systems.

For an internet-facing production deployment, additional controls would include authentication/authorization, stricter upload validation, request/rate limits, security headers/CSP, HTTPS, centralized logging/auditing, durable storage, retention policies, background workers, model/version pinning, and observability.

---

### SKIP BEHAVIOR

**Skip current** cancels one active label request and immediately continues the batch. The skipped label is marked **SKIPPED** and is not counted as PASS, FAIL, REVIEW, or ERROR.

In sequential mode, Skip applies to the only active label. In parallel mode, the app skips the selected active label when one is selected; otherwise it skips the oldest active label. A skipped label is excluded from the remainder of the current batch but can be analyzed again by starting a new batch.

### PAUSE BEHAVIOR

**Pause** is an immediate client-side pause. The browser aborts every active label-analysis HTTP request and prevents workers from claiming additional labels. Interrupted labels return to **WAITING** without being counted as errors or REVIEW results.

When **Resume** is pressed, interrupted labels restart their analysis from the beginning. A remote HTTP/model inference request cannot be suspended and resumed from the exact internal point where it was interrupted, so restarting the label is the deterministic and safe behavior.

As with Stop, work that already reached a remote provider may finish internally after the browser disconnects, but its late result is ignored.

### STOP BEHAVIOR

**Stop** is an immediate client-side stop. The browser aborts every active label-analysis HTTP request, prevents new work from being claimed, returns interrupted queue items to **WAITING**, and immediately restores the controls. Aborted work is not counted as an error or REVIEW result.

A request that has already reached a remote provider or blocking server worker may finish internally after the browser disconnects, but its result is discarded and is never added back into the stopped batch.

## CSV AND PDF BATCH REPORTS

The **Results** panel includes **Export CSV** and **Export PDF** controls.

The report is built from the current in-browser batch snapshot, including loaded application forms, label queue status, extracted label fields, matched-application data, match confidence/signals, verification receipts, field-level PASS/FAIL/REVIEW details, model notes, extracted raw text, skipped/error/waiting status, and the batch summary.

The CSV is a single rectangular table using a `record_type` column (`BATCH_SUMMARY`, `APPLICATION`, or `LABEL`) so application and label information remain machine-readable in one file. Text cells beginning with spreadsheet formula characters are escaped to reduce CSV-formula-injection risk.

The PDF is a human-readable batch report with a summary, application-form section, and detailed section for every label currently in the queue.

## STARTING A NEW BATCH

The interface can be reset without refreshing the page:

- **Application Forms -> Clear all** removes every loaded PDF; individual PDFs can also be removed from their rows.
- Each image has an **Ã—** control for immediate removal in both Grid and Details views.
- **Label Images -> Remove selected** also deletes the currently selected image.
- **Label Images -> Clear all** removes the full image queue.
- Removing inputs clears stale analysis results so a new batch cannot accidentally display decisions from the previous input set.

## BASIC USE

1. Start the server or open the hosted deployment.
2. Optionally use **Test Voice** to confirm audio output.
3. Upload one or more application-form PDFs.
4. Upload one or more label images.
5. Select an AI/OCR engine.
6. Choose sequential or parallel processing.
7. Start analysis.
8. Review the matched application, extracted fields, field-level findings, and final **PASS / FAIL / REVIEW** status.
9. Treat **REVIEW** as a human-review queue rather than an automatic approval or rejection.
