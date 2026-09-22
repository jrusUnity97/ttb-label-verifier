# ============================================================================
# ANNOTATED STUDY COPY
# THESE COMMENTS ARE INTENTIONALLY MORE DETAILED THAN NORMAL PRODUCTION CODE.
# THEY EXPLAIN EACH FUNCTION AND LOGICAL STATEMENT/BLOCK SO THE AUTHOR CAN
# REHEARSE THE DATA FLOW AND DESIGN DECISIONS BEFORE A TECHNICAL DISCUSSION.
# THE ORIGINAL SUBMISSION PACKAGE REMAINS UNCHANGED.
# ============================================================================


# IMPORT ANNOTATIONS FROM __FUTURE__ FOR THE OPERATIONS USED BELOW.
from __future__ import annotations

# IMPORT IO FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import io
# IMPORT OS FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import os
# IMPORT THREADING FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import threading
# IMPORT PATH FROM PATHLIB FOR THE OPERATIONS USED BELOW.
from pathlib import Path


# SET `BASE_DIR` FOR USE BY THE FOLLOWING PROCESSING STEPS.
BASE_DIR = Path(__file__).resolve().parent

# SET `MODEL_PATH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
MODEL_PATH = Path(
    os.getenv(
        "KOKORO_MODEL_PATH",
        BASE_DIR / "models" / "kokoro-v1.0.onnx",
    )
)

# SET `VOICES_PATH` FOR USE BY THE FOLLOWING PROCESSING STEPS.
VOICES_PATH = Path(
    os.getenv(
        "KOKORO_VOICES_PATH",
        BASE_DIR / "models" / "voices-v1.0.bin",
    )
)

# SET `VOICE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
VOICE = os.getenv(
    "KOKORO_VOICE",
    "bm_george",
)

# SET `LANGUAGE` FOR USE BY THE FOLLOWING PROCESSING STEPS.
LANGUAGE = os.getenv(
    "KOKORO_LANG",
    "en-gb",
)

# SET `SPEED` FOR USE BY THE FOLLOWING PROCESSING STEPS.
SPEED = float(
    os.getenv(
        "KOKORO_SPEED",
        "0.96",
    )
)

# SET `_MODEL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
_model = None
# SET `_MODEL_LOCK` FOR USE BY THE FOLLOWING PROCESSING STEPS.
_model_lock = threading.Lock()
# SET `_SPEECH_LOCK` FOR USE BY THE FOLLOWING PROCESSING STEPS.
_speech_lock = threading.Lock()


# IMPORT OPTIONAL TEXT-TO-SPEECH DEPENDENCIES ONLY WHEN VOICE OUTPUT IS REQUESTED.
def _get_dependencies():
    """
    Import TTS-only dependencies lazily.

    This keeps the web app itself from crashing at startup if Kokoro or
    soundfile has not been installed yet. The /api/speak endpoint will return
    a useful error and the browser can use its voice fallback.
    """

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # IMPORT SF FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
        import soundfile as sf
    except ImportError as exc:
        # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
        raise RuntimeError(
            "Kokoro voice dependency 'soundfile' is not installed. "
            "Run: python -m pip install soundfile"
        ) from exc

    # RUN THIS OPERATION INSIDE ERROR HANDLING SO FAILURES CAN BE CONVERTED INTO A CONTROLLED RESULT.
    try:
        # IMPORT KOKORO FROM KOKORO_ONNX FOR THE OPERATIONS USED BELOW.
        from kokoro_onnx import Kokoro
    except ImportError as exc:
        # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
        raise RuntimeError(
            "Kokoro voice dependency 'kokoro-onnx' is not installed. "
            "Run: python -m pip install kokoro-onnx"
        ) from exc

    # RETURN THE COMPLETED VALUE TO THE CALLER.
    return sf, Kokoro


# LOAD AND CACHE THE KOKORO MODEL ONCE IN A THREAD-SAFE WAY.
def _get_model():
    # EXECUTE THIS GLOBAL STATEMENT AS PART OF THE CURRENT PROCESSING STEP.
    global _model

    # CHECK `_MODEL IS NOT NONE` AND TAKE THE APPROPRIATE BRANCH.
    if _model is not None:
        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return _model

    # ENTER THE MANAGED CONTEXT FOR THIS RESOURCE AND GUARANTEE THAT IT IS RELEASED CORRECTLY.
    with _model_lock:
        # CHECK `_MODEL IS NOT NONE` AND TAKE THE APPROPRIATE BRANCH.
        if _model is not None:
            # RETURN THE COMPLETED VALUE TO THE CALLER.
            return _model

        # SET `(_, KOKORO)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        _, Kokoro = _get_dependencies()

        # CHECK `NOT MODEL_PATH.EXISTS()` AND TAKE THE APPROPRIATE BRANCH.
        if not MODEL_PATH.exists():
            # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
            raise RuntimeError(
                "Kokoro model is missing. Run: "
                "python download_kokoro_models.py"
            )

        # CHECK `NOT VOICES_PATH.EXISTS()` AND TAKE THE APPROPRIATE BRANCH.
        if not VOICES_PATH.exists():
            # STOP THIS PATH WITH A CLEAR EXCEPTION BECAUSE THE INPUT OR DEPENDENCY CANNOT BE HANDLED SAFELY.
            raise RuntimeError(
                "Kokoro voices file is missing. Run: "
                "python download_kokoro_models.py"
            )

        # SET `_MODEL` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        _model = Kokoro(
            str(MODEL_PATH),
            str(VOICES_PATH),
        )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return _model


# SYNTHESIZE SPEECH WITH KOKORO AND RETURN AN IN-MEMORY WAV BYTE STREAM.
def synthesize_wav(text: str) -> bytes:
    # SET `(SF, _)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    sf, _ = _get_dependencies()

    # ENTER THE MANAGED CONTEXT FOR THIS RESOURCE AND GUARANTEE THAT IT IS RELEASED CORRECTLY.
    with _speech_lock:
        # SET `KOKORO` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        kokoro = _get_model()

        # SET `(SAMPLES, SAMPLE_RATE)` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        samples, sample_rate = kokoro.create(
            text,
            voice=VOICE,
            speed=SPEED,
            lang=LANGUAGE,
        )

        # SET `BUFFER` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        buffer = io.BytesIO()

        # CALL `SF.WRITE` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
        sf.write(
            buffer,
            samples,
            sample_rate,
            format="WAV",
        )

        # RETURN THE COMPLETED VALUE TO THE CALLER.
        return buffer.getvalue()
