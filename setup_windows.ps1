$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "TTB Label Verifier setup"
Write-Host "==========================="
Write-Host ""

$pythonCommand = $null

try {
    py -3.12 --version | Out-Null
    $pythonCommand = "py -3.12"
}
catch {
    try {
        py -3.13 --version | Out-Null
        $pythonCommand = "py -3.13"
    }
    catch {
        Write-Host "Python 3.12 or 3.13 is required for Kokoro."
        Write-Host "Your previous Python 3.14 install cannot install current kokoro-onnx."
        Write-Host ""
        Write-Host "Install Python 3.12, then run this script again."
        exit 1
    }
}

Write-Host "Using: $pythonCommand"
Write-Host ""

Invoke-Expression "$pythonCommand -m venv .venv"

& ".\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv\Scripts\python.exe" -m pip install -r requirements.txt

Write-Host ""
Write-Host "Downloading Kokoro voice model..."
& ".\.venv\Scripts\python.exe" download_kokoro_models.py

Write-Host ""
Write-Host "Configuring Ollama to permit up to 5 parallel requests..."
[Environment]::SetEnvironmentVariable(
    "OLLAMA_NUM_PARALLEL",
    "5",
    "User"
)

Write-Host ""
Write-Host "Setup complete."
Write-Host ""
Write-Host "IMPORTANT:"
Write-Host "1. Fully quit and restart Ollama so OLLAMA_NUM_PARALLEL=5 takes effect."
Write-Host "2. Pull at least one supported vision model if needed:"
Write-Host "   ollama pull gemma3:4b"
Write-Host "   ollama pull qwen2.5vl:7b"
Write-Host "3. Activate the environment:"
Write-Host "   .\.venv\Scripts\Activate.ps1"
Write-Host "4. Start the app:"
Write-Host "   python -m uvicorn app:app --reload"
Write-Host ""
