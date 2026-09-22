# AI-Powered Alcohol Label Verification Prototype

**Prepared by John Russell**

A take-home prototype for AI-assisted alcohol label review. The application accepts alcohol-label images and application-form PDFs, extracts structured information, matches each label to the most likely application, and returns field-level and overall **PASS / FAIL / REVIEW** results.

> **Prototype notice:** This tool is a demonstration and does not make official TTB approvals, COLA determinations, or legal decisions. Ambiguous or low-confidence cases are intentionally routed to human review.

## Runtime Modes

The same application supports both local development and hosted review.

| Environment | Vision inference | OCR | Voice |
|---|---|---|---|
| Local workstation | Ollama running Gemma 3 or Qwen2.5-VL | Local Tesseract | Local Kokoro ONNX, with browser fallback |
| Railway deployment | OpenRouter-hosted Gemma 3 or Qwen2.5-VL | Tesseract installed in the Docker image | Client-side Kokoro using WebGPU/FP32 when available, then browser speech |

The business-rule layer is the same in both environments. AI/OCR extracts label information; normal Python validation makes the final **PASS / FAIL / REVIEW** decision.

---

## Local Installation and Run Instructions

### Prerequisites

- Windows 10/11
- Python 3.12 recommended
- Ollama installed and running for local vision-model inference
- Tesseract OCR installed if the Tesseract engine will be used
- Git is optional unless cloning/pushing the repository from the command line

### 1. Obtain the project

Clone the repository or download/extract the project folder. Open PowerShell in the project root, where `app.py`, `requirements.txt`, `templates/`, and `static/` are located.

### 2. Create and activate a virtual environment

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 3. Install Python dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Install the local vision models

For local AI vision mode, install at least one supported Ollama model:

```powershell
ollama pull gemma3:4b
ollama pull qwen2.5vl:7b
```

The application uses local Ollama automatically when `OPENROUTER_API_KEY` is not present.

### 5. Configure Tesseract OCR

If Tesseract is installed, the application attempts to locate `tesseract.exe` automatically. It checks Windows `PATH`, standard Program Files locations, and a common per-user install location.

If Tesseract is installed somewhere else, set the path before starting the app:

```powershell
$env:TESSERACT_CMD = "C:\Path\To\Tesseract-OCR\tesseract.exe"
```

No edit to `engines.py` is required.

### 6. Optional local voice setup

The project includes optional Kokoro ONNX speech output. Download the required model files with:

```powershell
python download_kokoro_models.py
```

If Kokoro is unavailable, the browser speech engine can be used as a fallback.

### 7. Start the application

```powershell
python -m uvicorn app:app --reload
```

Open:

```text
http://127.0.0.1:8000
```

### Optional Windows setup helper

A convenience script is also provided:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_windows.ps1
```

After changing Ollama parallel-processing settings, fully restart Ollama before testing parallel batches.

---

## Hosted Deployment: Railway + OpenRouter

The public demo is designed to deploy from GitHub to Railway. Railway builds the application from the included root `Dockerfile`, which:

- uses Python 3.12,
- installs the Tesseract executable inside the container,
- installs the Python dependencies from `requirements.txt`, and
- starts FastAPI/Uvicorn on Railway's assigned `$PORT`.

The included `railway.json` defines the Uvicorn start command so the service launches `app:app` explicitly.

### Hosted vision inference

Railway cannot access Ollama running on a developer workstation. For that reason, the deployed application switches the same Gemma/Qwen UI choices to OpenRouter-hosted multimodal inference whenever `OPENROUTER_API_KEY` is configured.

Configure these Railway service variables:

```text
OPENROUTER_API_KEY=<secret API key>
OPENROUTER_GEMMA_MODEL=google/gemma-3-4b-it
OPENROUTER_QWEN_MODEL=qwen/qwen2.5-vl-72b-instruct
```

The Qwen hosted default uses the 72B endpoint because the smaller Qwen2.5-VL 7B OpenRouter route was not consistently available during deployment testing. Local development still uses the lighter `qwen2.5vl:7b` Ollama model.

Secrets are stored only as Railway environment variables and are not committed to source control. A low API-key spending cap is appropriate for this demonstration deployment.

### Hosted voice behavior

Voice is an optional usability feature, not part of the compliance decision path. The hosted application moves Kokoro synthesis out of Railway and into the reviewer's browser:

1. **WebGPU + FP32** runs Kokoro with the clearer `bf_emma` British female voice when supported.
2. If WebGPU is unavailable or fails, the app falls directly back to the browser's built-in `SpeechSynthesis` voice.

The hosted build intentionally skips quantized WASM Kokoro because audio quality is prioritized over maintaining a second Kokoro execution path.

When **Announce batch completion** is enabled, the browser begins loading Kokoro as soon as analysis starts. Model initialization therefore overlaps with label processing instead of waiting until the batch has already finished.

The Kokoro model is downloaded on first use and is normally cached by the browser afterward, so the first voice request can still take longer than later requests. Chrome/Edge-class browsers with WebGPU generally provide the best experience. Hosted speech text does not need to be synthesized on Railway's CPU.

Voice latency or availability does **not** affect label extraction, application matching, or **PASS / FAIL / REVIEW** logic.

---

## Approach

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

### 1. Application-form extraction

`application_parser.py` uses PyMuPDF to read text-based application PDFs and extract fields such as application ID, brand name, product/class, ABV, and container size.

### 2. Label extraction

`engines.py` supports multiple extraction approaches:

- Gemma 3 Vision through local Ollama or a hosted OpenRouter vision endpoint
- Qwen2.5-VL through local Ollama or a hosted OpenRouter vision endpoint
- Tesseract OCR with image preprocessing

When `OPENROUTER_API_KEY` is present, Gemma/Qwen requests are sent to the configured hosted models. Without that variable, the same engine choices use local Ollama. The models extract structured label information; they are **not** asked to make the final compliance decision.

### 3. Application matching

`matching.py` compares the extracted label information against uploaded applications. Brand, product/class, container size, and ABV contribute to a weighted score.

A confident match proceeds to validation. Ambiguous or weak matches become **REVIEW** rather than being guessed.

### 4. Deterministic validation

`validation.py` performs the final field checks. The prototype evaluates:

- Brand name
- Alcohol by volume (ABV)
- Government warning text and visible warning-heading characteristics when detectable

The overall result is conservative:

- Any required field that clearly fails -> **FAIL**
- Any unresolved or uncertain required field -> **REVIEW**
- All required checks pass -> **PASS**

### 5. Browser interface

The UI is intentionally implemented without a separate front-end framework so the project remains easy to run and review.

- `templates/index.html` contains page structure.
- `static/styles.css` contains presentation and layout.
- `static/app.js` contains browser behavior, uploads, batch processing, API calls, result rendering, and review controls.
- Context tooltips explain upload behavior, batch controls, matching, results, and per-engine trade-offs without permanently cluttering the dashboard.

Dynamic OCR/model/file content is treated as untrusted output and escaped before it is inserted into generated HTML.

### 6. Optional voice output

The **Test Voice** button lets a reviewer confirm audio output before running a batch. Local installations can use Kokoro ONNX through FastAPI. The hosted deployment runs Kokoro with WebGPU/FP32 and the `bf_emma` British female voice when available, then falls back directly to the browser speech API.

Voice is intentionally separate from the verification pipeline and does **not** influence OCR/vision extraction, application matching, or **PASS / FAIL / REVIEW** decisions.

---

## Tools Used

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
| Speech | Kokoro ONNX locally; Kokoro.js WebGPU/FP32 in hosted browsers | Optional status and batch-summary audio without hosted CPU synthesis |

---

## Project Structure

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
  kokoro_browser.js       Hosted browser-side Kokoro WebGPU/WASM loader
```

---

## Assumptions and Limitations

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

## Basic Use

1. Start the server or open the hosted deployment.
2. Optionally use **Test Voice** to confirm audio output.
3. Upload one or more application-form PDFs.
4. Upload one or more label images.
5. Select an AI/OCR engine.
6. Choose sequential or parallel processing.
7. Start analysis.
8. Review the matched application, extracted fields, field-level findings, and final **PASS / FAIL / REVIEW** status.
9. Treat **REVIEW** as a human-review queue rather than an automatic approval or rejection.
