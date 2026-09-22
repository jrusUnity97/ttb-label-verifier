# ============================================================================
# ANNOTATED STUDY COPY
# THESE COMMENTS ARE INTENTIONALLY MORE DETAILED THAN NORMAL PRODUCTION CODE.
# THEY EXPLAIN EACH FUNCTION AND LOGICAL STATEMENT/BLOCK SO THE AUTHOR CAN
# REHEARSE THE DATA FLOW AND DESIGN DECISIONS BEFORE A TECHNICAL DISCUSSION.
# THE ORIGINAL SUBMISSION PACKAGE REMAINS UNCHANGED.
# ============================================================================


# IMPORT ANNOTATIONS FROM __FUTURE__ FOR THE OPERATIONS USED BELOW.
from __future__ import annotations

# IMPORT SHUTIL FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import shutil
# IMPORT URLLIB.REQUEST FOR THE SUPPORTING OPERATIONS IN THIS MODULE.
import urllib.request
# IMPORT PATH FROM PATHLIB FOR THE OPERATIONS USED BELOW.
from pathlib import Path


# SET `BASE_DIR` FOR USE BY THE FOLLOWING PROCESSING STEPS.
BASE_DIR = Path(__file__).resolve().parent
# SET `MODEL_DIR` FOR USE BY THE FOLLOWING PROCESSING STEPS.
MODEL_DIR = BASE_DIR / "models"

# SET `FILES` FOR USE BY THE FOLLOWING PROCESSING STEPS.
FILES = {
    "kokoro-v1.0.onnx": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/"
        "download/model-files-v1.1/kokoro-v1.0.onnx"
    ),
    "voices-v1.0.bin": (
        "https://github.com/thewh1teagle/kokoro-onnx/releases/"
        "download/model-files-v1.1/voices-v1.0.bin"
    ),
}


# DOWNLOAD ONE KOKORO MODEL ASSET SAFELY THROUGH A TEMPORARY PARTIAL FILE BEFORE REPLACING THE DESTINATION.
def download(url: str, destination: Path):
    # SET `TEMP` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    temp = destination.with_suffix(
        destination.suffix + ".part"
    )

    # CALL `PRINT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    print(f"Downloading {destination.name}...")

    # SET `REQUEST` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "TTB-Label-Verifier-Prototype/1.0",
        },
    )

    # ENTER THE MANAGED CONTEXT FOR THIS RESOURCE AND GUARANTEE THAT IT IS RELEASED CORRECTLY.
    with urllib.request.urlopen(request) as response:
        # ENTER THE MANAGED CONTEXT FOR THIS RESOURCE AND GUARANTEE THAT IT IS RELEASED CORRECTLY.
        with temp.open("wb") as output:
            # CALL `SHUTIL.COPYFILEOBJ` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
            shutil.copyfileobj(
                response,
                output,
                length=1024 * 1024,
            )

    # CALL `TEMP.REPLACE` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    temp.replace(destination)

    # SET `SIZE_MB` FOR USE BY THE FOLLOWING PROCESSING STEPS.
    size_mb = destination.stat().st_size / 1024 / 1024

    # CALL `PRINT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    print(
        f"Saved {destination.name} "
        f"({size_mb:.1f} MB)"
    )


# CREATE THE MODEL DIRECTORY AND DOWNLOAD ANY MISSING KOKORO MODEL FILES.
def main():
    # CALL `MODEL_DIR.MKDIR` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    MODEL_DIR.mkdir(
        parents=True,
        exist_ok=True,
    )

    # LOOP THROUGH `FILES.ITEMS()` AND PROCESS EACH `(FILENAME, URL)`.
    for filename, url in FILES.items():
        # SET `DESTINATION` FOR USE BY THE FOLLOWING PROCESSING STEPS.
        destination = MODEL_DIR / filename

        # CHECK `DESTINATION.EXISTS()` AND TAKE THE APPROPRIATE BRANCH.
        if destination.exists():
            # CALL `PRINT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
            print(
                f"{filename} already exists; skipping."
            )
            # SKIP THE REST OF THIS ITERATION AND CONTINUE WITH THE NEXT ITEM.
            continue

        # CALL `DOWNLOAD` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
        download(
            url,
            destination,
        )

    # CALL `PRINT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    print()
    # CALL `PRINT` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    print(
        "Kokoro is ready. "
        "Voice: bm_george (British English)."
    )


# CHECK `__NAME__ == '__MAIN__'` AND TAKE THE APPROPRIATE BRANCH.
if __name__ == "__main__":
    # CALL `MAIN` TO PERFORM THIS SIDE EFFECT OR SUPPORTING ACTION.
    main()
