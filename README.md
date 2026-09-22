# AI-Powered Alcohol Label Verification Prototype

**Prepared by John Russell**

A take-home prototype for AI-assisted alcohol label review. The application accepts alcohol-label images and application-form PDFs, extracts structured information, matches each label to the most likely application, and returns field-level and overall **PASS / FAIL / REVIEW** results.

> **Prototype notice:** This tool is a demonstration and does not make official TTB approvals, COLA determinations, or legal decisions. Ambiguous or low-confidence cases are intentionally routed to human review.

## Setup and Run Instructions

### Prerequisites

- Windows 10/11
- Python 3.12 recommended
- Ollama installed and running for local vision-model inference
- Tesseract OCR installed if the Tesseract engine will be used

### 1. Create and activate a virtual environment

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install Python dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Install supported Ollama vision models

At least one supported model is required for AI vision mode:

```powershell
ollama pull gemma3:4b
ollama pull qwen2.5vl:7b
```

### Tesseract OCR detection

If Tesseract is installed, the application attempts to find `tesseract.exe` automatically. It checks Windows `PATH`, the standard `C:\Program Files\Tesseract-OCR` location, the 32-bit Program Files location, and a common per-user installation folder. If Tesseract is installed somewhere else, set an explicit path before starting the app:

```powershell
$env:TESSERACT_CMD = "C:\Path\To\Tesseract-OCR\tesseract.exe"
```

No edit to `engines.py` is required.

### 4. Optional voice setup

The project includes optional local Kokoro speech output. Download the required model files with:

```powershell
python download_kokoro_models.py
```

### 5. Start the application

```powershell
python -m uvicorn app:app --reload
```

Open the application at:

```text
http://127.0.0.1:8000
```

### Windows setup helper

A convenience script is also provided:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup_windows.ps1
```

After changing Ollama parallel-processing settings, fully restart Ollama before testing parallel batches.

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

- Gemma 3 Vision through Ollama
- Qwen2.5-VL through Ollama
- Tesseract OCR with image preprocessing


The AI models are used to extract structured information from the label. They are **not** asked to make the final compliance decision.

### 3. Application matching

`matching.py` compares the extracted label information against the uploaded applications. Brand, product/class, container size, and ABV contribute to a weighted score.

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
- Context tooltips on major workflow sections explain drag-and-drop behavior, batch controls, matching, results, and per-engine speed/trade-offs without permanently cluttering the dashboard.

Dynamic OCR/model/file content is treated as untrusted output and escaped before it is inserted into generated HTML.

### 6. Optional voice output

The application includes optional voice output as a usability and accessibility aid. The **Test Voice** button in the header lets the reviewer confirm audio output before running a batch. When available, the app uses local **Kokoro ONNX** text-to-speech; if local Kokoro playback is unavailable, the browser speech engine can be used as a fallback.

Voice is intentionally separate from the verification pipeline. It does **not** influence OCR/vision extraction, application matching, or **PASS / FAIL / REVIEW** decisions. Its purpose is only to announce concise status or batch-summary information to the user.

---

## Tools Used

| Area | Tool / Library | Purpose |
|---|---|---|
| Backend API | FastAPI | HTTP routes, file uploads, and request orchestration |
| Templates | Jinja2 | Serves the browser interface |
| Front end | HTML / CSS / JavaScript | Upload, batch, review, and result UI |
| Local AI inference | Ollama | Runs local multimodal vision models |
| Vision models | Gemma 3 / Qwen2.5-VL | Extracts structured information from label images |
| OCR | Tesseract + OpenCV | Local OCR and image preprocessing |
| PDF parsing | PyMuPDF | Reads application-form PDF text |
| Data validation | Pydantic / Python | Structured request and result data |
| Speech | Kokoro ONNX | Optional local text-to-speech for voice testing and spoken batch summaries |

---

## Project Structure

```text
app.py                    FastAPI routes and main request orchestration
application_parser.py     Application-PDF field extraction
engines.py                Vision and OCR extraction engines
matching.py               Label-to-application matching logic
validation.py             PASS / FAIL / REVIEW rules
models.py                 Pydantic data structures
tts.py                    Optional local speech generation
requirements.txt          Python dependencies
setup_windows.ps1         Windows setup helper
download_kokoro_models.py Optional voice-model downloader

templates/
  index.html              Browser page structure

static/
  styles.css              UI styling
  app.js                  Browser logic and API interaction
```

---

## Assumptions and Limitations

- The prototype is a **decision-support tool**, not an official regulatory approval system.
- Application PDFs are assumed to be text-based. Scanned PDFs would require an OCR fallback.
- Label images are assumed to contain enough visible information for the selected OCR or vision engine to extract relevant fields.
- AI/model output is probabilistic, so uncertain extraction or matching results are routed to **REVIEW**.
- A human reviewer is assumed to be available for ambiguous cases.
- Ollama, Tesseract, and optional Kokoro components run locally for the prototype; no hosted AI API key is required.
- Batch processing demonstrates sequential and parallel workflows but is not intended to represent a production-scale distributed job system.
- Performance varies by model, image quality, CPU/GPU hardware, and concurrency level.
- The prototype does not implement enterprise authentication, RBAC, persistent audit storage, malware scanning, or integration with authoritative TTB systems.

For an internet-facing production deployment, additional controls would include authentication/authorization, stricter upload validation, request/rate limits, security headers/CSP, HTTPS, centralized logging/auditing, durable storage, retention policies, and isolated background workers for expensive OCR/model inference.

---

## Basic Use

1. Start the server and open the application in a browser.
2. Optionally use **Test Voice** to confirm audio output.
3. Upload one or more application-form PDFs.
4. Upload one or more label images.
5. Select an AI/OCR engine.
6. Choose sequential or parallel processing.
7. Start analysis.
8. Review the matched application, extracted fields, field-level findings, and final **PASS / FAIL / REVIEW** status.
9. Treat **REVIEW** as a human-review queue rather than an automatic approval or rejection.
