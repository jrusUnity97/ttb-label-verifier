/*
 * Browser-side Kokoro TTS
 * -----------------------
 * Hosted deployments use this module to move speech synthesis off the
 * Railway CPU and onto the reviewer's browser.
 *
 * Preferred path:
 *   WebGPU -> Kokoro 82M -> browser audio
 *
 * If WebGPU is unavailable or initialization fails, static/app.js falls
 * directly back to the browser's built-in SpeechSynthesis API. The hosted
 * build intentionally avoids the lower-quality quantized WASM Kokoro path.
 *
 * The Kokoro model is downloaded from Hugging Face on first use and is
 * normally cached by the browser afterwards. The JavaScript package is
 * loaded from jsDelivr so this project does not need a Node build step.
 */

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const VOICE = "bf_emma";
const SPEED = 1.0;
const KOKORO_MODULE_URL =
    "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm";

let runtimePromise = null;


/*
 * Load Kokoro once and cache the initialized runtime.
 *
 * WebGPU is preferred when the browser exposes navigator.gpu. If WebGPU
 * initialization fails, retry with the WASM backend so voice remains usable.
 */
async function loadRuntime() {

    if (runtimePromise) {
        return runtimePromise;
    }

    runtimePromise = (async () => {

        if (!navigator.gpu) {
            throw new Error(
                "WebGPU is not available in this browser."
            );
        }

        const { KokoroTTS } =
            await import(KOKORO_MODULE_URL);

        const tts =
            await KokoroTTS.from_pretrained(
                MODEL_ID,
                {
                    device: "webgpu",
                    dtype: "fp32"
                }
            );

        return {
            tts,
            device: "webgpu"
        };
    })();

    /*
     * If loading fails completely, clear the promise so a later user action
     * can retry rather than permanently caching a rejected Promise.
     */
    try {
        return await runtimePromise;
    }
    catch (error) {
        runtimePromise = null;
        throw error;
    }
}


/*
 * Begin loading the browser model without generating audio.
 * The main app calls this when a batch starts so model initialization can
 * overlap with label analysis instead of beginning after the batch completes.
 */
async function warmup() {
    const runtime = await loadRuntime();

    return {
        device: runtime.device
    };
}


/*
 * Generate one short speech clip.
 * Kokoro's RawAudio helper exposes toBlob(), which lets the existing browser
 * audio element play the result without sending speech text to Railway.
 */
async function synthesize(text) {

    const runtime =
        await loadRuntime();

    const audio =
        await runtime.tts.generate(
            text,
            {
                voice: VOICE,
                speed: SPEED
            }
        );

    return {
        blob: audio.toBlob(),
        device: runtime.device
    };
}


window.KokoroBrowser = {
    warmup,
    synthesize
};
