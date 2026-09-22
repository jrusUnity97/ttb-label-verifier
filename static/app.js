/*
 * TTB LABEL VERIFIER - BROWSER APPLICATION
 * -----------------------------------------
 * THIS FILE CONTAINS THE CLIENT-SIDE BEHAVIOR THAT USED TO BE EMBEDDED IN
 * TEMPLATES/INDEX.HTML. KEEPING JAVASCRIPT HERE MAKES THE HTML EASIER TO READ,
 * LETS BROWSER BEHAVIOR BE STUDIED INDEPENDENTLY, AND PRESERVES SEPARATION OF
 * CONCERNS:
 *
 *   TEMPLATES/INDEX.HTML  -> PAGE STRUCTURE / SEMANTIC MARKUP
 *   STATIC/STYLES.CSS     -> PRESENTATION / LAYOUT
 *   STATIC/APP.JS         -> BROWSER STATE, EVENTS, API CALLS, RENDERING
 *   APP.PY                -> FASTAPI ROUTES / SERVER ORCHESTRATION
 *
 * THE CODE IS WRAPPED IN AN IIFE SO ITS VARIABLES DO NOT LEAK INTO THE GLOBAL
 * BROWSER NAMESPACE. FUNCTION-LEVEL COMMENTS EXPLAIN THE PURPOSE OF EACH MAJOR
 * UNIT SO THE APPLICATION CAN BE REHEARSED FOR A TECHNICAL DISCUSSION.
 */

(() => {

    const MAX_FILES = 25;

    const ENGINE_PROFILES = {
        ollama_gemma3: {
            baseSeconds: 3.0,
            secondsPerMP: 0.45
        },
        ollama_qwen25vl: {
            baseSeconds: 4.0,
            secondsPerMP: 0.60
        },
        tesseract: {
            baseSeconds: 1.0,
            secondsPerMP: 0.25
        }
    };


    // ----------------------------------------------------------
    // DOM
    // ----------------------------------------------------------

    const engineRadios = Array.from(
        document.querySelectorAll(
            'input[name="engine"]'
        )
    );

    const engineCards = Array.from(
        document.querySelectorAll(
            ".engine-card"
        )
    );

    const processingModeRadios = Array.from(
        document.querySelectorAll(
            'input[name="processing-mode"]'
        )
    );

    const modeCards = Array.from(
        document.querySelectorAll(
            ".mode-card"
        )
    );

    const concurrencyWrap =
        document.getElementById("concurrency-wrap");

    const concurrencySelect =
        document.getElementById("concurrency-select");

    const fileInput =
        document.getElementById("label-files");

    const applicationFilesInput =
        document.getElementById("application-files");

    const applicationDropZone =
        document.getElementById("application-drop-zone");

    const browseApplicationButton =
        document.getElementById("browse-application-button");

    const applicationFileList =
        document.getElementById("application-file-list");

    const clearApplicationsButton =
        document.getElementById("clear-applications-button");

    const dropZone =
        document.getElementById("drop-zone");

    const browseFilesButton =
        document.getElementById("browse-files-button");

    const removeSelectedImageButton =
        document.getElementById("remove-selected-image-button");

    const clearImagesButton =
        document.getElementById("clear-images-button");

    const analyzeButton =
        document.getElementById("analyze-button");

    const pauseButton =
        document.getElementById("pause-button");

    const resumeButton =
        document.getElementById("resume-button");

    const skipButton =
        document.getElementById("skip-button");

    const stopButton =
        document.getElementById("stop-button");

    const speakButton =
        document.getElementById("speak-summary");

    const exportCsvButton =
        document.getElementById("export-csv-button");

    const exportPdfButton =
        document.getElementById("export-pdf-button");

    const announceComplete =
        document.getElementById("announce-complete");

    const testVoiceButton =
        document.getElementById("test-voice-button");


    const helpButton =
        document.getElementById("help-button");

    const helpModal =
        document.getElementById("help-modal");

    const helpCloseButton =
        document.getElementById("help-close-button");

    const helpReadmeContent =
        document.getElementById("help-readme-content");

    const voiceStatus =
        document.getElementById("voice-status");

    const controlMessage =
        document.getElementById("control-message");

    const batchState =
        document.getElementById("batch-state");

    const progressLabel =
        document.getElementById("progress-label");

    const progressFill =
        document.getElementById("progress-fill");

    const activeCount =
        document.getElementById("active-count");

    const currentEngine =
        document.getElementById("current-engine");

    const currentMode =
        document.getElementById("current-mode");

    const currentConcurrency =
        document.getElementById("current-concurrency");

    const batchElapsed =
        document.getElementById("batch-elapsed");

    const activeFiles =
        document.getElementById("active-files");

    const currentApplication =
        document.getElementById("current-application");

    const eta =
        document.getElementById("eta");

    const queueList =
        document.getElementById("queue-list");

    const queueCount =
        document.getElementById("queue-count");

    const resultsList =
        document.getElementById("results-list");

    const passedCount =
        document.getElementById("passed-count");

    const failedCount =
        document.getElementById("failed-count");

    const reviewCount =
        document.getElementById("review-count");

    const gridViewButton =
        document.getElementById("grid-view-button");

    const detailsViewButton =
        document.getElementById("details-view-button");

    const extractionDetails =
        document.getElementById("extraction-details");

    const extractionSelectedFile =
        document.getElementById("extraction-selected-file");


    // ----------------------------------------------------------
    // STATE
    // ----------------------------------------------------------

    let queue = [];
    let applicationForms = [];
    let running = false;
    let paused = false;
    let pauseRequested = false;
    let stopRequested = false;
    let batchStartedAt = null;
    let elapsedTimer = null;
    let uploadView = "grid";
    let currentAudio = null;

    /*
     * ONE ABORTCONTROLLER PER ACTIVE LABEL REQUEST.
     * STOP uses these controllers to terminate the browser-side HTTP requests
     * immediately instead of waiting for active labels to finish.
     */
    const activeAnalysisControllers =
        new Map();

    const summary = {
        passed: 0,
        failed: 0,
        review: 0
    };


    // ----------------------------------------------------------
    // CONFIG
    // ----------------------------------------------------------

    // RETURN THE CURRENTLY SELECTED ANALYSIS-ENGINE RADIO BUTTON.
    function selectedEngineRadio() {
        return engineRadios.find(
            radio => radio.checked
        );
    }


    // RETURN THE MACHINE-READABLE VALUE OF THE SELECTED ANALYSIS ENGINE.
    function selectedEngineValue() {
        return selectedEngineRadio()?.value || "";
    }


    // RETURN THE HUMAN-READABLE NAME SHOWN FOR THE SELECTED ANALYSIS ENGINE.
    function selectedEngineLabel() {
        const radio = selectedEngineRadio();

        if (!radio) {
            return "—";
        }

        return (
            radio
                .closest(".engine-card")
                ?.querySelector(".engine-name")
                ?.textContent
                ?.trim()
            ||
            radio.value
        );
    }


    // RETURN WHETHER THIS BATCH SHOULD RUN SEQUENTIALLY OR IN PARALLEL.
    function selectedProcessingMode() {
        return (
            processingModeRadios.find(
                radio => radio.checked
            )?.value
            ||
            "sequential"
        );
    }


    // CONVERT THE CURRENT PROCESSING SETTINGS INTO AN ACTUAL WORKER COUNT.
    function selectedConcurrency() {
        if (
            selectedProcessingMode()
            ===
            "sequential"
        ) {
            return 1;
        }

        return Number(
            concurrencySelect.value
        );
    }


    // SYNCHRONIZE CARD HIGHLIGHTING, CONCURRENCY CONTROLS, AND ESTIMATES WITH THE CURRENT CONFIGURATION.
    function updateConfigurationUi() {
        engineCards.forEach(
            card => {
                const radio =
                    card.querySelector(
                        'input[type="radio"]'
                    );

                card.classList.toggle(
                    "selected",
                    Boolean(radio?.checked)
                );
            }
        );

        modeCards.forEach(
            card => {
                const radio =
                    card.querySelector(
                        'input[type="radio"]'
                    );

                card.classList.toggle(
                    "selected",
                    Boolean(radio?.checked)
                );
            }
        );

        const parallel =
            selectedProcessingMode()
            ===
            "parallel";

        concurrencySelect.disabled =
            !parallel;

        concurrencyWrap.classList.toggle(
            "disabled-control",
            !parallel
        );

        recalculateQueueEstimates();
    }


    engineRadios.forEach(
        radio => {
            radio.addEventListener(
                "change",
                updateConfigurationUi
            );
        }
    );


    processingModeRadios.forEach(
        radio => {
            radio.addEventListener(
                "change",
                updateConfigurationUi
            );
        }
    );


    concurrencySelect.addEventListener(
        "change",
        recalculateQueueEstimates
    );


    // ----------------------------------------------------------
    // UTILS
    // ----------------------------------------------------------

    // ESCAPE DYNAMIC TEXT BEFORE INSERTING IT INTO HTML SO UPLOADED/MODEL CONTENT CANNOT BECOME MARKUP.
    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }


    // FORMAT RAW SECONDS AS A COMPACT HUMAN-READABLE ELAPSED/ESTIMATED DURATION.
    function formatDuration(seconds) {
        if (
            !Number.isFinite(seconds)
            ||
            seconds < 0
        ) {
            return "—";
        }

        if (seconds < 60) {
            return (
                seconds.toFixed(
                    seconds < 10 ? 1 : 0
                )
                +
                " sec"
            );
        }

        const minutes =
            Math.floor(seconds / 60);

        const remainder =
            Math.round(seconds % 60);

        if (minutes < 60) {
            return (
                `${minutes} min `
                +
                `${remainder} sec`
            );
        }

        const hours =
            Math.floor(minutes / 60);

        return (
            `${hours} hr `
            +
            `${minutes % 60} min`
        );
    }


    // READ AN UPLOADED IMAGE LOCALLY TO DETERMINE ITS WIDTH AND HEIGHT FOR RUNTIME ESTIMATION.
    function getImageDimensions(file) {
        return new Promise(
            (resolve, reject) => {

                const image = new Image();
                const url =
                    URL.createObjectURL(file);

                image.onload = () => {

                    const width =
                        image.naturalWidth;

                    const height =
                        image.naturalHeight;

                    URL.revokeObjectURL(url);

                    resolve({
                        width,
                        height,
                        megapixels:
                            (
                                width
                                *
                                height
                            )
                            /
                            1_000_000
                    });

                };

                image.onerror = () => {

                    URL.revokeObjectURL(url);

                    reject(
                        new Error(
                            "Could not read image dimensions."
                        )
                    );

                };

                image.src = url;

            }
        );
    }


    // ----------------------------------------------------------
    // ESTIMATES
    // ----------------------------------------------------------

    // ESTIMATE ANALYSIS TIME FOR ONE IMAGE FROM ENGINE, DIMENSIONS, AND PROCESSING MODE.
    function estimateImageSeconds(
        megapixels,
        engineKey
    ) {
        const profile =
            ENGINE_PROFILES[engineKey]
            ||
            {
                baseSeconds: 3,
                secondsPerMP: 0.5
            };

        const mp =
            Number.isFinite(megapixels)
                ?
                megapixels
                :
                5;

        return (
            profile.baseSeconds
            +
            (
                mp
                *
                profile.secondsPerMP
            )
        );
    }


    // RECOMPUTE PER-FILE AND BATCH ESTIMATES WHENEVER QUEUE/CONFIGURATION DATA CHANGES.
    function recalculateQueueEstimates() {
        const engineKey =
            selectedEngineValue();

        queue.forEach(
            item => {
                item.estimatedSeconds =
                    estimateImageSeconds(
                        item.megapixels,
                        engineKey
                    );
            }
        );

        renderQueue();
        updateEta();
    }


    // REFRESH THE ESTIMATED COMPLETION TIME SHOWN IN THE STATUS AREA.
    function updateEta() {
        if (queue.length === 0) {
            eta.textContent = "—";
            return;
        }

        const concurrency =
            selectedConcurrency();

        let remainingWork = 0;

        queue.forEach(
            item => {

                if (
                    item.status
                    ===
                    "waiting"
                ) {
                    remainingWork +=
                        item.estimatedSeconds || 0;
                }

                if (
                    item.status
                    ===
                    "processing"
                ) {
                    const elapsed =
                        item.startedAt
                            ?
                            (
                                performance.now()
                                -
                                item.startedAt
                            )
                            /
                            1000
                            :
                            0;

                    remainingWork +=
                        Math.max(
                            (
                                item.estimatedSeconds
                                ||
                                0
                            )
                            -
                            elapsed,
                            0
                        );
                }

            }
        );

        const wallClockEstimate =
            remainingWork
            /
            Math.max(
                concurrency,
                1
            );

        eta.textContent =
            `~${formatDuration(
                wallClockEstimate
            )}`;
    }


    // ----------------------------------------------------------
    // STATUS
    // ----------------------------------------------------------

    // RETURN QUEUE ITEMS THAT ARE ACTIVELY BEING PROCESSED.
    function activeItems() {
        return queue.filter(
            item =>
                item.status
                ===
                "processing"
        );
    }


    // UPDATE THE UI TEXT DESCRIBING THE FILES AND APPLICATION CURRENTLY BEING PROCESSED.
    function refreshActiveStatus() {
        const active =
            activeItems();

        activeCount.textContent =
            active.length;

        skipButton.disabled =
            !running
            ||
            pauseRequested
            ||
            stopRequested
            ||
            active.length === 0;

        if (active.length === 0) {
            activeFiles.textContent =
                "No images";
        }
        else {
            activeFiles.textContent =
                active
                    .map(
                        item =>
                            item.file.name
                    )
                    .join(", ");
        }

        updateEta();
    }


    // START THE INTERVAL THAT UPDATES ELAPSED BATCH TIME AND ETA WHILE PROCESSING IS ACTIVE.
    function startElapsedTimer() {
        stopElapsedTimer();

        elapsedTimer =
            setInterval(
                () => {

                    if (
                        batchStartedAt
                        !==
                        null
                    ) {
                        const elapsed =
                            (
                                performance.now()
                                -
                                batchStartedAt
                            )
                            /
                            1000;

                        batchElapsed.textContent =
                            formatDuration(
                                elapsed
                            );
                    }

                    refreshActiveStatus();

                },
                250
            );
    }


    // STOP AND CLEAR THE ELAPSED-TIME INTERVAL WHEN PROCESSING FINISHES OR STOPS.
    function stopElapsedTimer() {
        if (elapsedTimer) {
            clearInterval(
                elapsedTimer
            );
        }

        elapsedTimer = null;
    }


    // ENABLE REPORT EXPORT WHEN THE CURRENT SESSION CONTAINS INPUT OR RESULT DATA.
    function updateExportControls() {

        const hasData =
            applicationForms.length > 0
            ||
            queue.length > 0;

        exportCsvButton.disabled =
            running
            ||
            !hasData;

        exportPdfButton.disabled =
            running
            ||
            !hasData;
    }


    // BUILD A COMPLETE, SERIALIZABLE SNAPSHOT OF THE CURRENT BATCH.
    function buildReportPayload(format) {

        const skipped =
            queue.filter(
                item =>
                    item.status
                    ===
                    "skipped"
            ).length;

        const errors =
            queue.filter(
                item =>
                    item.status
                    ===
                    "error"
            ).length;

        const waiting =
            queue.filter(
                item =>
                    item.status
                    ===
                    "waiting"
                ||
                    item.status
                    ===
                    "claimed"
                ||
                    item.status
                    ===
                    "processing"
            ).length;

        return {
            format,
            generated_at:
                new Date()
                    .toISOString(),
            summary: {
                total:
                    queue.length,
                passed:
                    summary.passed,
                failed:
                    summary.failed,
                review:
                    summary.review,
                skipped,
                errors,
                waiting,
            },
            applications:
                applicationForms.map(
                    record => ({
                        filename:
                            record.file
                                ?.name
                            ||
                            record.extracted
                                ?.filename
                            ||
                            "",
                        status:
                            record.status,
                        error:
                            record.error
                            ||
                            null,
                        extracted:
                            record.extracted
                            ||
                            null,
                    })
                ),
            items:
                queue.map(
                    item => ({
                        filename:
                            item.file
                                ?.name
                            ||
                            "",
                        queue_status:
                            item.status,
                        result_status:
                            item.resultStatus
                            ||
                            null,
                        file_size_bytes:
                            item.file
                                ?.size
                            ??
                            null,
                        width:
                            item.width
                            ??
                            null,
                        height:
                            item.height
                            ??
                            null,
                        megapixels:
                            item.megapixels
                            ??
                            null,
                        estimated_seconds:
                            item.estimatedSeconds
                            ??
                            null,
                        error:
                            (
                                item.status
                                ===
                                "error"
                            )
                                ?
                                (
                                    item.payload
                                        ?.error
                                    ||
                                    "Analysis error"
                                )
                                :
                                null,
                        payload:
                            item.payload
                            ||
                            null,
                    })
                ),
        };
    }


    // REQUEST THE REPORT FROM FASTAPI AND DOWNLOAD THE RETURNED FILE.
    async function exportBatchReport(format) {

        updateExportControls();

        exportCsvButton.disabled = true;
        exportPdfButton.disabled = true;

        controlMessage.textContent =
            `Preparing ${format.toUpperCase()} report...`;

        try {
            const response =
                await fetch(
                    "/api/export-report",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json",
                        },
                        body:
                            JSON.stringify(
                                buildReportPayload(
                                    format
                                )
                            ),
                    }
                );

            if (!response.ok) {

                let message =
                    "Report export failed.";

                try {
                    const errorPayload =
                        await response.json();

                    message =
                        errorPayload.error
                        ||
                        message;
                }
                catch {
                    // USE CONTROLLED FALLBACK MESSAGE.
                }

                throw new Error(
                    message
                );
            }

            const blob =
                await response.blob();

            const disposition =
                response.headers.get(
                    "Content-Disposition"
                )
                ||
                "";

            const filenameMatch =
                disposition.match(
                    /filename="?([^"]+)"?/i
                );

            const filename =
                filenameMatch
                    ?.[1]
                ||
                `ttb-label-verification-report.${format}`;

            const url =
                URL.createObjectURL(
                    blob
                );

            const anchor =
                document.createElement(
                    "a"
                );

            anchor.href = url;
            anchor.download =
                filename;

            document.body.appendChild(
                anchor
            );

            anchor.click();
            anchor.remove();

            window.setTimeout(
                () => {
                    URL.revokeObjectURL(
                        url
                    );
                },
                1000
            );

            controlMessage.textContent =
                `${format.toUpperCase()} report downloaded.`;
        }
        catch (error) {
            controlMessage.textContent =
                error.message;
        }
        finally {
            updateExportControls();
        }
    }


    // REFRESH THE PASS/FAIL/REVIEW COUNTERS FROM CURRENT BATCH STATE.
    function updateSummary() {
        passedCount.textContent =
            summary.passed;

        failedCount.textContent =
            summary.failed;

        reviewCount.textContent =
            summary.review;

        const completed =
            summary.passed
            +
            summary.failed
            +
            summary.review;

        speakButton.disabled =
            completed === 0;

        updateExportControls();
    }


    /*
     * CLEAR BATCH RESULTS/COUNTERS WHEN INPUTS CHANGE.
     *
     * A completed result is only valid for the exact application/image pool
     * used during that analysis. Removing inputs therefore clears result
     * cards, counters, extraction details, and elapsed/progress state.
     */
    function resetAnalysisOutput() {

        summary.passed = 0;
        summary.failed = 0;
        summary.review = 0;

        updateSummary();

        resultsList.innerHTML = "";
        extractionDetails.innerHTML = "";

        extractionSelectedFile.textContent =
            "No completed extraction";

        batchState.textContent = "IDLE";
        batchElapsed.textContent = "0.0 sec";
        progressFill.style.width = "0%";
        activeCount.textContent = "0";
        activeFiles.textContent = "—";
        currentApplication.textContent = "—";

        stopElapsedTimer();

        batchStartedAt = null;
        paused = false;
        pauseRequested = false;
        stopRequested = false;
    }


    /*
     * INVALIDATE IMAGE RESULTS WITHOUT REMOVING THE IMAGES.
     * USED WHEN THE APPLICATION POOL CHANGES.
     */
    function invalidateQueuedResults() {

        queue.forEach(
            item => {
                item.payload = null;
                item.resultStatus = null;
                item.startedAt = null;

                if (
                    item.status === "complete"
                    ||
                    item.status === "error"
                ) {
                    item.status = "waiting";
                }
            }
        );

        resetAnalysisOutput();
    }


    // REFRESH THE PROGRESS BAR AND PROCESSED-ITEM COUNTS.
    function updateProgress() {
        const completed =
            queue.filter(
                item =>
                    item.status
                    ===
                    "complete"
                    ||
                    item.status
                    ===
                    "error"
                    ||
                    item.status
                    ===
                    "skipped"
            ).length;

        const total =
            queue.length;

        progressLabel.textContent =
            `${completed} / ${total}`;

        progressFill.style.width =
            `${
                total
                    ?
                    (
                        completed
                        /
                        total
                    )
                    *
                    100
                    :
                    0
            }%`;

        queueCount.textContent =
            `${total} image`
            +
            (
                total === 1
                    ?
                    ""
                    :
                    "s"
            );
    }


    // ----------------------------------------------------------
    // QUEUE RENDER
    // ----------------------------------------------------------

    // CONVERT AN INTERNAL QUEUE STATE INTO THE CONCISE TEXT DISPLAYED TO THE USER.
    function queueItemStatusText(item) {
        return (
            item.resultStatus
            ||
            (
                item.status
                ===
                "processing"
                    ?
                    "PROCESSING"
                    :
                item.status
                ===
                "error"
                    ?
                    "ERROR"
                    :
                item.status
                ===
                "skipped"
                    ?
                    "SKIPPED"
                    :
                    "WAITING"
            )
        );
    }


    // RENDER THE COMPLETE IMAGE QUEUE USING THE CURRENTLY SELECTED GRID/DETAILS VIEW.
    function renderQueue() {
        updateExportControls();

        queueList.classList.toggle(
            "grid-view",
            uploadView === "grid"
        );

        queueList.classList.toggle(
            "details-view",
            uploadView === "details"
        );

        const selectedQueueIndex =
            queue.findIndex(
                item => item.selected
            );

        removeSelectedImageButton.disabled =
            running
            ||
            selectedQueueIndex < 0;

        clearImagesButton.disabled =
            running
            ||
            queue.length === 0;

        if (queue.length === 0) {
            queueList.innerHTML =
                '<p class="queue-empty">'
                +
                'Select label images to build the queue.'
                +
                '</p>';

            updateProgress();
            return;
        }

        if (uploadView === "grid") {
            queueList.innerHTML =
                queue
                .map(
                    (item, index) => {

                        const sizeText =
                            Number.isFinite(
                                item.megapixels
                            )
                                ?
                                `${item.megapixels.toFixed(1)} MP`
                                :
                                "Unknown size";

                        const estimateText =
                            Number.isFinite(
                                item.estimatedSeconds
                            )
                                ?
                                `~${formatDuration(
                                    item.estimatedSeconds
                                )}`
                                :
                                "—";

                        return `

                            <div class="queue-item-wrap grid-item-wrap">

                                <button
                                    type="button"
                                    class="
                                        upload-grid-card
                                        ${escapeHtml(
                                            item.status
                                        )}
                                        ${
                                            item.selected
                                                ?
                                                "selected"
                                                :
                                                ""
                                        }
                                    "
                                    data-index="${index}"
                                >

                                    <img
                                        src="${escapeHtml(
                                            item.previewUrl
                                        )}"
                                        alt=""
                                    >

                                    <div class="upload-grid-body">

                                        <strong>
                                            ${escapeHtml(
                                                item.file.name
                                            )}
                                        </strong>

                                        <span>
                                            ${escapeHtml(
                                                sizeText
                                            )}
                                            ·
                                            ${escapeHtml(
                                                estimateText
                                            )}
                                        </span>

                                        <span class="upload-grid-status">
                                            ${escapeHtml(
                                                queueItemStatusText(
                                                    item
                                                )
                                            )}
                                        </span>

                                        <span
                                            class="
                                                app-match-badge
                                                ${itemMatchStatus(
                                                    item
                                                ).status.toLowerCase()}
                                            "
                                            title="${escapeHtml(
                                                itemMatchStatus(
                                                    item
                                                ).title
                                            )}"
                                        >
                                            ${escapeHtml(
                                                itemMatchStatus(
                                                    item
                                                ).label
                                            )}
                                        </span>

                                    </div>

                                </button>

                                <button
                                    type="button"
                                    class="queue-remove-x"
                                    data-remove-index="${index}"
                                    title="Remove ${escapeHtml(
                                        item.file.name
                                    )}"
                                    aria-label="Remove ${escapeHtml(
                                        item.file.name
                                    )}"
                                    ${running ? "disabled" : ""}
                                >
                                    ×
                                </button>

                            </div>

                        `;

                    }
                )
                .join("");
        }
        else {
            queueList.innerHTML =
                queue
                .map(
                    (item, index) => {

                        const dimensions =
                            item.width
                            &&
                            item.height
                                ?
                                `${item.width} × ${item.height}`
                                :
                                "Unknown";

                        const fileSize =
                            `${(
                                item.file.size
                                /
                                1024
                                /
                                1024
                            ).toFixed(2)} MB`;

                        const mp =
                            Number.isFinite(
                                item.megapixels
                            )
                                ?
                                `${item.megapixels.toFixed(1)} MP`
                                :
                                "—";

                        const estimate =
                            Number.isFinite(
                                item.estimatedSeconds
                            )
                                ?
                                `~${formatDuration(
                                    item.estimatedSeconds
                                )}`
                                :
                                "—";

                        return `

                            <div class="queue-item-wrap detail-item-wrap">

                                <button
                                    type="button"
                                    class="
                                        upload-detail-row
                                        ${escapeHtml(
                                            item.status
                                        )}
                                        ${
                                            item.selected
                                                ?
                                                "selected"
                                                :
                                                ""
                                        }
                                    "
                                    data-index="${index}"
                                >

                                <img
                                    src="${escapeHtml(
                                        item.previewUrl
                                    )}"
                                    alt=""
                                >

                                <span class="detail-name">
                                    ${escapeHtml(
                                        item.file.name
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        dimensions
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        mp
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        fileSize
                                    )}
                                </span>

                                <span>
                                    ${escapeHtml(
                                        estimate
                                    )}
                                </span>

                                <span class="detail-status">
                                    ${escapeHtml(
                                        queueItemStatusText(
                                            item
                                        )
                                    )}
                                </span>

                                <span
                                    class="
                                        detail-app-match
                                        ${itemMatchStatus(
                                            item
                                        ).status.toLowerCase()}
                                    "
                                    title="${escapeHtml(
                                        itemMatchStatus(
                                            item
                                        ).title
                                    )}"
                                >
                                    ${escapeHtml(
                                        itemMatchStatus(
                                            item
                                        ).status
                                        ===
                                        "MATCHED"
                                            ?
                                            "APP ✓"
                                            :
                                        itemMatchStatus(
                                            item
                                        ).status
                                        ===
                                        "UNCERTAIN"
                                            ?
                                            "APP ?"
                                            :
                                        itemMatchStatus(
                                            item
                                        ).status
                                        ===
                                        "UNMATCHED"
                                            ?
                                            "NO APP"
                                            :
                                            "PENDING"
                                    )}
                                </span>

                                </button>

                                <button
                                    type="button"
                                    class="queue-remove-x detail-remove-x"
                                    data-remove-index="${index}"
                                    title="Remove ${escapeHtml(
                                        item.file.name
                                    )}"
                                    aria-label="Remove ${escapeHtml(
                                        item.file.name
                                    )}"
                                    ${running ? "disabled" : ""}
                                >
                                    ×
                                </button>

                            </div>

                        `;

                    }
                )
                .join("");
        }

        queueList
            .querySelectorAll(
                "[data-index]"
            )
            .forEach(
                element => {
                    element.addEventListener(
                        "click",
                        () => {
                            selectQueueItem(
                                Number(
                                    element.dataset.index
                                )
                            );
                        }
                    );
                }
            );

        /*
         * EACH IMAGE HAS ITS OWN X REMOVE CONTROL IN BOTH GRID AND DETAILS
         * VIEWS. STOP PROPAGATION SO REMOVING AN IMAGE DOES NOT ALSO SELECT IT.
         */
        queueList
            .querySelectorAll(
                "[data-remove-index]"
            )
            .forEach(
                element => {
                    element.addEventListener(
                        "click",
                        event => {
                            event.stopPropagation();

                            removeQueueItem(
                                Number(
                                    element.dataset.removeIndex
                                )
                            );
                        }
                    );
                }
            );

        updateProgress();
    }


    // ----------------------------------------------------------
    // SELECTION / EXTRACTION
    // ----------------------------------------------------------

    // MAKE ONE QUEUE ITEM THE ACTIVE SELECTION AND REFRESH ITS EXTRACTED DETAILS.
    function selectQueueItem(index) {
        queue.forEach(
            (item, itemIndex) => {
                item.selected =
                    itemIndex === index;
            }
        );

        renderQueue();

        const item =
            queue[index];

        if (
            item
            &&
            item.payload
        ) {
            showExtraction(
                item.payload
            );
        }
        else {
            extractionSelectedFile.textContent =
                item
                    ?
                    item.file.name
                    :
                    "No completed extraction";

            extractionDetails.innerHTML =
                "";
        }
    }


    // RENDER STRUCTURED EXTRACTION, MATCHING, AND VERIFICATION DETAILS FOR THE SELECTED ITEM.
    function showExtraction(payload) {
        const extracted =
            payload.extracted || {};

        const verification =
            payload.verification || {};

        const confidence =
            extracted.extraction_confidence
            ==
            null
                ?
                "—"
                :
                `${Math.round(
                    extracted.extraction_confidence
                    *
                    100
                )}%`;

        extractionSelectedFile.textContent =
            payload.filename;

        extractionDetails.innerHTML = `

            <div class="receipt-strip">

                <span>
                    Verification Receipt
                </span>

                <strong>
                    ${escapeHtml(
                        payload.receipt_number
                    )}
                </strong>

                <span
                    class="
                        status
                        ${escapeHtml(
                            verification.overall_status
                        ).toLowerCase()}
                    "
                >
                    ${escapeHtml(
                        verification.overall_status
                    )}
                </span>

            </div>


            <div class="extraction-grid">

                <div>
                    <span>Engine</span>
                    <strong>
                        ${escapeHtml(
                            payload.engine
                        )}
                    </strong>
                </div>

                <div>
                    <span>Application match</span>
                    <strong>
                        ${
                            payload.application_match
                                ?.application
                                ?.application_id
                                ?
                                escapeHtml(
                                    payload.application_match
                                        .application
                                        .application_id
                                )
                                :
                                escapeHtml(
                                    payload.application_match
                                        ?.status
                                        ||
                                        "No match"
                                )
                        }
                    </strong>
                </div>

                <div>
                    <span>Match confidence</span>
                    <strong>
                        ${
                            Number.isFinite(
                                payload.application_match
                                    ?.confidence
                            )
                                ?
                                `${payload.application_match.confidence}%`
                                :
                                "—"
                        }
                    </strong>
                </div>

                <div>
                    <span>Brand</span>
                    <strong>
                        ${escapeHtml(
                            extracted.brand_name
                            ||
                            "Not detected"
                        )}
                    </strong>
                </div>

                <div>
                    <span>ABV</span>
                    <strong>
                        ${escapeHtml(
                            extracted.abv
                            ||
                            "Not detected"
                        )}
                    </strong>
                </div>

                <div>
                    <span>Confidence</span>
                    <strong>
                        ${escapeHtml(
                            confidence
                        )}
                    </strong>
                </div>

                <div>
                    <span>Uppercase warning</span>
                    <strong>
                        ${escapeHtml(
                            extracted.warning_heading_uppercase
                        )}
                    </strong>
                </div>

                <div>
                    <span>Bold warning</span>
                    <strong>
                        ${escapeHtml(
                            extracted.warning_heading_bold
                        )}
                    </strong>
                </div>

            </div>


            ${
                payload.application_match
                    ?.application
                    ?
                    `
                    <div class="extraction-block matched-application-block">
                        <span>Matched application</span>

                        <p>
                            <strong>
                                ${escapeHtml(
                                    payload.application_match
                                        .application
                                        .application_id
                                        ||
                                        "Application"
                                )}
                            </strong>
                            ·
                            ${escapeHtml(
                                payload.application_match
                                    .application
                                    .brand_name
                                    ||
                                    "Brand unavailable"
                            )}
                            ·
                            ${escapeHtml(
                                payload.application_match
                                    .application
                                    .product_type
                                    ||
                                    "Type unavailable"
                            )}
                            ·
                            ${escapeHtml(
                                payload.application_match
                                    .application
                                    .abv
                                    ||
                                    "ABV unavailable"
                            )}
                            ·
                            ${escapeHtml(
                                payload.application_match
                                    .application
                                    .container_size
                                    ||
                                    "Size unavailable"
                            )}
                        </p>
                    </div>
                    `
                    :
                    ""
            }


            <div class="extraction-block">
                <span>Government warning</span>

                <p>
                    ${escapeHtml(
                        extracted.government_warning
                        ||
                        "Not detected"
                    )}
                </p>
            </div>


            <div class="extraction-block">
                <span>Notes</span>

                <p>
                    ${escapeHtml(
                        extracted.notes
                        ||
                        "None"
                    )}
                </p>
            </div>


            <div class="extraction-block">
                <span>Raw extracted text</span>

                <pre>${escapeHtml(
                    extracted.raw_text
                    ||
                    ""
                )}</pre>
            </div>

        `;
    }


    // ----------------------------------------------------------
    // VIEW MODE
    // ----------------------------------------------------------

    gridViewButton.addEventListener(
        "click",
        () => {
            uploadView = "grid";

            gridViewButton.classList.add(
                "active"
            );

            detailsViewButton.classList.remove(
                "active"
            );

            renderQueue();
        }
    );


    detailsViewButton.addEventListener(
        "click",
        () => {
            uploadView = "details";

            detailsViewButton.classList.add(
                "active"
            );

            gridViewButton.classList.remove(
                "active"
            );

            renderQueue();
        }
    );


    // ----------------------------------------------------------
    // AI CONTENT MATCHING
    // ----------------------------------------------------------

    // RETURN THE APPLICATION-MATCHING STATUS ASSOCIATED WITH ONE PROCESSED QUEUE ITEM.
    function itemMatchStatus(item) {

        const match =
            item.payload
                ?.application_match;

        if (!match) {
            return {
                status: "PENDING",
                label: "AI MATCH PENDING",
                title:
                    "The label has not been analyzed yet."
            };
        }

        if (
            match.status
            ===
            "MATCHED"
        ) {
            const application =
                match.application || {};

            return {
                status: "MATCHED",
                label:
                    `✓ ${
                        application.application_id
                        ||
                        "APP MATCHED"
                    }`,
                title:
                    `${application.filename || "Application"} · `
                    +
                    `${match.confidence}% match confidence`
            };
        }

        if (
            match.status
            ===
            "UNCERTAIN"
        ) {
            return {
                status: "UNCERTAIN",
                label: "⚠ MATCH UNCERTAIN",
                title:
                    `${match.confidence}% confidence — human confirmation required`
            };
        }

        return {
            status: "UNMATCHED",
            label: "○ NO APP MATCH",
            title:
                "No sufficiently similar application was found."
        };
    }


    // REFRESH THE APPLICATION-MATCH INDICATOR AFTER QUEUE OR APPLICATION CHANGES.
    function refreshApplicationMatchDisplay() {
        renderQueue();
        renderApplicationForms();
    }


    // ----------------------------------------------------------
    // GLOBAL FILE-DROP SAFETY
    // ----------------------------------------------------------

    /*
        BROWSERS MAY OTHERWISE OPEN A DROPPED PDF/IMAGE AS A NEW PAGE WHEN THE
        POINTER LANDS A FEW PIXELS OUTSIDE A DROP ZONE. PREVENT THAT NAVIGATION
        FOR FILE DRAGS WHILE ALLOWING EACH DEDICATED DROP ZONE TO HANDLE FILES.
    */

    // DETECT WHETHER THE CURRENT DRAG EVENT ACTUALLY CONTAINS FILES.
    function containsFileDrag(event) {
        return Array.from(
            event.dataTransfer?.types || []
        ).includes("Files");
    }


    document.addEventListener(
        "dragover",
        event => {

            if (containsFileDrag(event)) {
                event.preventDefault();
            }

        }
    );


    document.addEventListener(
        "drop",
        event => {

            if (!containsFileDrag(event)) {
                return;
            }

            const insideApplicationZone =
                applicationDropZone.contains(
                    event.target
                );

            const insideImageZone =
                dropZone.contains(
                    event.target
                );

            if (
                !insideApplicationZone
                &&
                !insideImageZone
            ) {
                event.preventDefault();

                controlMessage.textContent =
                    "Drop application PDFs in Application Forms or label images in Label Images.";
            }

        }
    );


    /*
     * REMOVE ONE IMAGE FROM THE QUEUE AND RESET RESULTS FROM THE OLD BATCH.
     */
    function removeQueueItem(index) {

        if (
            running
            ||
            index < 0
            ||
            index >= queue.length
        ) {
            return;
        }

        const [removed] =
            queue.splice(
                index,
                1
            );

        if (removed?.previewUrl) {
            URL.revokeObjectURL(
                removed.previewUrl
            );
        }

        queue.forEach(
            item => {
                item.payload = null;
                item.resultStatus = null;
                item.status = "waiting";
                item.startedAt = null;
                item.selected = false;
            }
        );

        if (queue.length > 0) {
            const nextIndex =
                Math.min(
                    index,
                    queue.length - 1
                );

            queue[nextIndex].selected = true;
        }

        resetAnalysisOutput();

        renderQueue();
        renderApplicationForms();
        updateEta();

        controlMessage.textContent =
            "Selected label image removed. Existing batch results were cleared.";
    }


    removeSelectedImageButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const index =
                queue.findIndex(
                    item => item.selected
                );

            removeQueueItem(index);
        }
    );


    // REMOVE EVERY LABEL IMAGE AND RESET THE IMAGE-SIDE BATCH STATE.
    clearImagesButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            if (
                running
                ||
                queue.length === 0
            ) {
                return;
            }

            queue.forEach(
                item => {
                    if (item.previewUrl) {
                        URL.revokeObjectURL(
                            item.previewUrl
                        );
                    }
                }
            );

            queue = [];

            resetAnalysisOutput();

            renderQueue();
            renderApplicationForms();
            updateEta();

            fileInput.value = "";

            controlMessage.textContent =
                "All label images cleared. Add images for the next batch.";
        }
    );


    // ----------------------------------------------------------
    // APPLICATION FORMS + DRAG AND DROP
    // ----------------------------------------------------------

    // REJECT APPLICATION-FORM FILES THAT ARE NOT IN A SUPPORTED FORMAT.
    function isSupportedApplicationForm(file) {
        const name =
            file.name.toLowerCase();

        return (
            file.type === "application/pdf"
            ||
            name.endsWith(".pdf")
        );
    }


    // PREVENT THE SAME APPLICATION FORM FROM BEING LOADED MORE THAN ONCE.
    function isDuplicateApplicationForm(file) {
        return applicationForms.some(
            item =>
                item.file.name === file.name
                &&
                item.file.size === file.size
                &&
                item.file.lastModified === file.lastModified
        );
    }


    // RENDER THE CURRENT APPLICATION-FORM LIST AND EXTRACTION/MATCHING STATE.
    function renderApplicationForms() {

        updateExportControls();

        clearApplicationsButton.disabled =
            running
            ||
            applicationForms.length === 0;

        if (applicationForms.length === 0) {
            applicationFileList.innerHTML = "";
            return;
        }

        applicationFileList.innerHTML =
            applicationForms
                .map(
                    (record, index) => {

                        const extracted =
                            record.extracted || {};

                        const matchedItem =
                            queue.find(
                                item =>
                                    item.payload
                                        ?.application_match
                                        ?.application
                                        ?.filename
                                    ===
                                    record.file.name
                            );

                        let matchLine =
                            "Ready for AI matching";

                        let matchClass =
                            "pending";

                        if (matchedItem) {
                            const status =
                                matchedItem.payload
                                    .application_match
                                    .status;

                            matchLine =
                                `${status}: ${matchedItem.file.name}`;

                            matchClass =
                                status.toLowerCase();
                        }

                        const extractionLine =
                            record.status
                            ===
                            "ready"
                                ?
                                `${
                                    extracted.application_id
                                    ||
                                    "No application ID"
                                } · ${
                                    extracted.brand_name
                                    ||
                                    "Brand not found"
                                } · ${
                                    extracted.abv
                                    ||
                                    "ABV not found"
                                }`
                                :
                                record.status
                                ===
                                "extracting"
                                    ?
                                    "Reading PDF..."
                                    :
                                    (
                                        record.error
                                        ||
                                        "Application extraction failed"
                                    );

                        return `

                            <div class="application-file-row">

                                <div class="application-file-icon">
                                    PDF
                                </div>

                                <div class="application-file-name">

                                    <strong>
                                        ${escapeHtml(
                                            record.file.name
                                        )}
                                    </strong>

                                    <span>
                                        ${escapeHtml(
                                            extractionLine
                                        )}
                                    </span>

                                    <span
                                        class="
                                            application-match-text
                                            ${escapeHtml(
                                                matchClass
                                            )}
                                        "
                                    >
                                        ${escapeHtml(
                                            matchLine
                                        )}
                                    </span>

                                </div>

                                <button
                                    type="button"
                                    class="remove-application-file"
                                    data-app-index="${index}"
                                    aria-label="Remove ${escapeHtml(
                                        record.file.name
                                    )}"
                                >
                                    Remove
                                </button>

                            </div>

                        `;

                    }
                )
                .join("");

        applicationFileList
            .querySelectorAll(
                "[data-app-index]"
            )
            .forEach(
                button => {

                    button.addEventListener(
                        "click",
                        event => {

                            event.stopPropagation();

                            const index =
                                Number(
                                    button.dataset.appIndex
                                );

                            applicationForms.splice(
                                index,
                                1
                            );

                            /*
                                RESULTS USED THE PREVIOUS APPLICATION POOL,
                                SO INVALIDATE THEM BEFORE THE NEXT BATCH.
                            */
                            invalidateQueuedResults();

                            renderApplicationForms();
                            renderQueue();
                            updateEta();

                            controlMessage.textContent =
                                "Application removed. Existing analysis results were cleared.";

                        }
                    );

                }
            );
    }


    // REMOVE ALL APPLICATION FORMS AND CLEAR RESULTS THAT USED THEM.
    clearApplicationsButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            if (
                running
                ||
                applicationForms.length === 0
            ) {
                return;
            }

            applicationForms = [];

            invalidateQueuedResults();

            renderApplicationForms();
            renderQueue();
            updateEta();

            applicationFilesInput.value = "";

            controlMessage.textContent =
                "All application forms cleared. Add forms for the next batch.";
        }
    );


    // PARSE NEWLY DROPPED/SELECTED APPLICATION PDFS AND ADD VALID RECORDS TO THE BROWSER STATE.
    async function addApplicationForms(incomingFiles) {

        if (running) {
            controlMessage.textContent =
                "Wait until processing stops before adding application forms.";
            return;
        }

        const supported =
            Array.from(
                incomingFiles || []
            )
            .filter(
                isSupportedApplicationForm
            );

        if (supported.length === 0) {
            controlMessage.textContent =
                "Drop PDF application forms.";
            return;
        }

        const availableSlots =
            Math.max(
                MAX_FILES
                -
                applicationForms.length,
                0
            );

        if (availableSlots === 0) {
            controlMessage.textContent =
                `Maximum ${MAX_FILES} application forms already loaded.`;
            return;
        }

        const filesToAdd =
            supported
                .filter(
                    file =>
                        !isDuplicateApplicationForm(
                            file
                        )
                )
                .slice(
                    0,
                    availableSlots
                );

        if (filesToAdd.length === 0) {
            controlMessage.textContent =
                "Those application forms are already loaded.";
            return;
        }

        for (
            const file
            of
            filesToAdd
        ) {
            const record = {
                file,
                status: "extracting",
                extracted: null,
                error: null,
            };

            applicationForms.push(
                record
            );

            renderApplicationForms();

            const formData =
                new FormData();

            formData.append(
                "application",
                file
            );

            try {
                const response =
                    await fetch(
                        "/api/extract-application",
                        {
                            method: "POST",
                            body: formData,
                        }
                    );

                const payload =
                    await response.json();

                if (
                    !response.ok
                    ||
                    !payload.ok
                ) {
                    throw new Error(
                        payload.error
                        ||
                        "Application PDF extraction failed."
                    );
                }

                record.status = "ready";
                record.extracted =
                    payload.application;
            }
            catch (error) {
                record.status = "error";
                record.error =
                    error.message;
            }

            renderApplicationForms();
        }

        const readyCount =
            applicationForms.filter(
                item =>
                    item.status
                    ===
                    "ready"
            ).length;

        controlMessage.textContent =
            `${readyCount} application form(s) ready for AI matching.`;

    }


    applicationFilesInput.addEventListener(
        "change",
        async () => {

            await addApplicationForms(
                applicationFilesInput.files
            );

            applicationFilesInput.value = "";

        }
    );


    browseApplicationButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            if (
                !applicationFilesInput.disabled
            ) {
                applicationFilesInput.click();
            }

        }
    );


    applicationDropZone.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                browseApplicationButton
            ) {
                return;
            }

            if (
                !applicationFilesInput.disabled
            ) {
                applicationFilesInput.click();
            }

        }
    );


    applicationDropZone.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
                ||
                event.key === " "
            ) {
                event.preventDefault();

                if (
                    !applicationFilesInput.disabled
                ) {
                    applicationFilesInput.click();
                }
            }

        }
    );


    [
        "dragenter",
        "dragover"
    ].forEach(
        eventName => {

            applicationDropZone.addEventListener(
                eventName,
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    if (
                        !applicationFilesInput.disabled
                    ) {
                        applicationDropZone.classList.add(
                            "drag-over"
                        );
                    }

                }
            );

        }
    );


    [
        "dragleave",
        "drop"
    ].forEach(
        eventName => {

            applicationDropZone.addEventListener(
                eventName,
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    applicationDropZone.classList.remove(
                        "drag-over"
                    );

                }
            );

        }
    );


    applicationDropZone.addEventListener(
        "drop",
        async event => {

            if (
                applicationFilesInput.disabled
            ) {
                return;
            }

            const droppedFiles =
                event.dataTransfer?.files;

            if (
                !droppedFiles
                ||
                droppedFiles.length === 0
            ) {
                return;
            }

            const beforeCount =
                applicationForms.length;

            await addApplicationForms(
                droppedFiles
            );

            const added =
                applicationForms.length
                -
                beforeCount;

            if (added > 0) {
                applicationDropZone.classList.add(
                    "drop-success"
                );

                setTimeout(
                    () => {
                        applicationDropZone.classList.remove(
                            "drop-success"
                        );
                    },
                    700
                );
            }

        }
    );


    // ----------------------------------------------------------
    // FILES + DRAG AND DROP
    // ----------------------------------------------------------

    // CHECK WHETHER A SELECTED LABEL IMAGE USES A SUPPORTED FILE TYPE.
    function isSupportedImage(file) {
        const name =
            file.name
                .toLowerCase();

        return (
            file.type === "image/jpeg"
            ||
            file.type === "image/png"
            ||
            name.endsWith(".jpg")
            ||
            name.endsWith(".jpeg")
            ||
            name.endsWith(".png")
        );
    }


    // PREVENT DUPLICATE LABEL IMAGES FROM BEING QUEUED TWICE.
    function isDuplicateFile(file) {
        return queue.some(
            item =>
                item.file.name === file.name
                &&
                item.file.size === file.size
                &&
                item.file.lastModified === file.lastModified
        );
    }


    // ADD INCOMING LABEL IMAGES TO THE QUEUE, READ THEIR DIMENSIONS, AND UPDATE ESTIMATES/UI STATE.
    async function addFiles(incomingFiles) {

        if (running) {
            controlMessage.textContent =
                "Wait until processing stops before adding more images.";
            return;
        }

        const supportedFiles =
            Array.from(incomingFiles || [])
                .filter(isSupportedImage);

        if (supportedFiles.length === 0) {
            controlMessage.textContent =
                "Drop JPG, JPEG, or PNG images.";
            return;
        }

        const availableSlots =
            Math.max(
                MAX_FILES - queue.length,
                0
            );

        if (availableSlots === 0) {
            controlMessage.textContent =
                `Maximum ${MAX_FILES} images already loaded.`;
            return;
        }

        const filesToAdd =
            supportedFiles
                .filter(
                    file =>
                        !isDuplicateFile(file)
                )
                .slice(
                    0,
                    availableSlots
                );

        if (filesToAdd.length === 0) {
            controlMessage.textContent =
                "Those images are already in the queue.";
            return;
        }

        controlMessage.textContent =
            "Reading image details...";

        for (const file of filesToAdd) {

            let dimensions = {
                width: null,
                height: null,
                megapixels: null
            };

            try {
                dimensions =
                    await getImageDimensions(
                        file
                    );
            }
            catch {
                // KEEP UNKNOWN DIMENSIONS.
            }

            queue.push({
                file,
                status: "waiting",
                resultStatus: null,
                width: dimensions.width,
                height: dimensions.height,
                megapixels: dimensions.megapixels,
                estimatedSeconds:
                    estimateImageSeconds(
                        dimensions.megapixels,
                        selectedEngineValue()
                    ),
                previewUrl:
                    URL.createObjectURL(
                        file
                    ),
                payload: null,
                selected: false,
                startedAt: null
            });
        }

        if (
            queue.length > 0
            &&
            !queue.some(
                item => item.selected
            )
        ) {
            queue[0].selected = true;
        }

        const rejectedCount =
            supportedFiles.length
            -
            filesToAdd.length;

        if (
            queue.length >= MAX_FILES
            &&
            (
                supportedFiles.length
                >
                filesToAdd.length
            )
        ) {
            controlMessage.textContent =
                `Added ${filesToAdd.length} image(s). Maximum ${MAX_FILES} reached.`;
        }
        else if (rejectedCount > 0) {
            controlMessage.textContent =
                `Added ${filesToAdd.length} image(s). Duplicate files were skipped.`;
        }
        else {
            controlMessage.textContent =
                "";
        }

        /*
            V12 STILL CALLED THE OLD FILENAME-MATCHING FUNCTION HERE.
            THAT CAUSED A JAVASCRIPT REFERENCEERROR AFTER FILES WERE DROPPED,
            SO THE QUEUE NEVER VISIBLY UPDATED. CONTENT MATCHING NOW OCCURS
            AFTER AI/OCR ANALYSIS, SO SIMPLY RE-RENDER THE PENDING QUEUE.
        */
        renderQueue();
        renderApplicationForms();
        updateEta();

        controlMessage.textContent =
            `${filesToAdd.length} label image(s) added.`;
    }


    fileInput.addEventListener(
        "change",
        async () => {

            await addFiles(
                fileInput.files
            );

            /*
                CLEAR THE NATIVE INPUT VALUE SO THE SAME FILE CAN
                BE SELECTED AGAIN LATER IF IT WAS REMOVED/RELOADED.
            */
            fileInput.value = "";

        }
    );


    browseFilesButton.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            if (!fileInput.disabled) {
                fileInput.click();
            }

        }
    );


    dropZone.addEventListener(
        "click",
        event => {

            if (
                event.target === browseFilesButton
            ) {
                return;
            }

            if (!fileInput.disabled) {
                fileInput.click();
            }

        }
    );


    dropZone.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
                ||
                event.key === " "
            ) {
                event.preventDefault();

                if (!fileInput.disabled) {
                    fileInput.click();
                }
            }

        }
    );


    [
        "dragenter",
        "dragover"
    ].forEach(
        eventName => {

            dropZone.addEventListener(
                eventName,
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    if (!fileInput.disabled) {
                        dropZone.classList.add(
                            "drag-over"
                        );
                    }

                }
            );

        }
    );


    [
        "dragleave",
        "drop"
    ].forEach(
        eventName => {

            dropZone.addEventListener(
                eventName,
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    dropZone.classList.remove(
                        "drag-over"
                    );

                }
            );

        }
    );


    dropZone.addEventListener(
        "drop",
        async event => {

            if (fileInput.disabled) {
                return;
            }

            const droppedFiles =
                event.dataTransfer?.files;

            if (
                !droppedFiles
                ||
                droppedFiles.length === 0
            ) {
                return;
            }

            const beforeCount =
                queue.length;

            await addFiles(
                droppedFiles
            );

            const added =
                queue.length
                -
                beforeCount;

            if (added > 0) {
                dropZone.classList.add(
                    "drop-success"
                );

                setTimeout(
                    () => {
                        dropZone.classList.remove(
                            "drop-success"
                        );
                    },
                    700
                );
            }

        }
    );


    // ----------------------------------------------------------
    // CONTROL STATES
    // ----------------------------------------------------------

    // ENABLE OR DISABLE SETTINGS THAT MUST REMAIN FIXED WHILE A BATCH IS RUNNING.
    function disableConfiguration(disabled) {
        engineRadios.forEach(
            radio => {
                radio.disabled = disabled;
            }
        );

        processingModeRadios.forEach(
            radio => {
                radio.disabled = disabled;
            }
        );

        concurrencySelect.disabled =
            disabled
            ||
            selectedProcessingMode()
            !==
            "parallel";

        fileInput.disabled =
            disabled;

        applicationFilesInput.disabled =
            disabled;

        browseApplicationButton.disabled =
            disabled;

        clearApplicationsButton.disabled =
            disabled
            ||
            applicationForms.length === 0;

        applicationDropZone.classList.toggle(
            "disabled-control",
            disabled
        );

        applicationDropZone.setAttribute(
            "aria-disabled",
            disabled ? "true" : "false"
        );

        browseFilesButton.disabled =
            disabled;

        removeSelectedImageButton.disabled =
            disabled
            ||
            !queue.some(
                item => item.selected
            );

        clearImagesButton.disabled =
            disabled
            ||
            queue.length === 0;

        dropZone.classList.toggle(
            "disabled-control",
            disabled
        );

        dropZone.setAttribute(
            "aria-disabled",
            disabled ? "true" : "false"
        );
    }


    // PUT BUTTONS AND STATUS INDICATORS INTO THE ACTIVE-PROCESSING STATE.
    function setRunningControls() {
        analyzeButton.disabled = true;

        disableConfiguration(true);

        pauseButton.disabled = false;
        resumeButton.disabled = true;
        skipButton.disabled = true;
        stopButton.disabled = false;
    }


    // PUT CONTROLS INTO THE PAUSED STATE WHILE ALLOWING A LATER RESUME.
    function setPausedControls() {
        analyzeButton.disabled = true;

        pauseButton.disabled = true;
        resumeButton.disabled = false;
        skipButton.disabled = true;
        stopButton.disabled = false;
    }


    // RESTORE CONTROLS TO THE NORMAL IDLE STATE AFTER PROCESSING ENDS.
    function setIdleControls() {
        analyzeButton.disabled = false;

        disableConfiguration(false);

        pauseButton.disabled = true;
        resumeButton.disabled = true;
        skipButton.disabled = true;
        stopButton.disabled = true;

        updateConfigurationUi();
    }


    // ----------------------------------------------------------
    // RESULTS
    // ----------------------------------------------------------

    // BUILD ONE FIELD-LEVEL PASS/FAIL/REVIEW RESULT ROW SAFELY FOR INSERTION INTO THE RESULT CARD.
    function checkHtml(
        title,
        status,
        detail
    ) {
        const safeStatus =
            escapeHtml(
                status || "REVIEW"
            );

        return `

            <div class="check">

                <span
                    class="
                        status
                        small
                        ${safeStatus.toLowerCase()}
                    "
                >
                    ${safeStatus}
                </span>

                <div>
                    <strong>
                        ${escapeHtml(title)}
                    </strong>

                    <p>
                        ${escapeHtml(
                            detail || ""
                        )}
                    </p>
                </div>

            </div>

        `;
    }


    // APPEND ONE COMPLETED VERIFICATION RESULT TO THE RESULTS PANEL.
    function appendResult(
        payload,
        item
    ) {
        const verification =
            payload.verification || {};

        const card =
            document.createElement(
                "article"
            );

        card.className =
            "result-card";

        card.innerHTML = `

            <div class="result-head">

                <div>
                    <p class="filename">
                        ${escapeHtml(
                            payload.filename
                        )}
                    </p>

                    <p class="timing">
                        ${escapeHtml(
                            payload.engine
                        )}
                        ·
                        ${escapeHtml(
                            payload.processing_seconds
                        )}
                        sec
                    </p>
                </div>

                <span
                    class="
                        status
                        ${escapeHtml(
                            verification.overall_status
                        ).toLowerCase()}
                    "
                >
                    ${escapeHtml(
                        verification.overall_status
                    )}
                </span>

            </div>


            <div class="receipt-mini">
                <span>Verification Receipt</span>

                <strong>
                    ${escapeHtml(
                        payload.receipt_number
                    )}
                </strong>
            </div>


            <div class="checks">

                ${checkHtml(
                    "Brand",
                    verification.brand_status,
                    verification.brand_detail
                )}

                ${checkHtml(
                    "ABV",
                    verification.abv_status,
                    verification.abv_detail
                )}

                ${checkHtml(
                    "Government warning",
                    verification.warning_status,
                    verification.warning_detail
                )}

            </div>

        `;

        card.addEventListener(
            "click",
            () => {
                const index =
                    queue.indexOf(item);

                if (index >= 0) {
                    selectQueueItem(index);
                }
            }
        );

        resultsList.prepend(card);
    }


    // APPEND A CONTROLLED ERROR RESULT WHEN ONE QUEUE ITEM CANNOT BE ANALYZED SUCCESSFULLY.
    function appendErrorResult(
        filename,
        message
    ) {
        const card =
            document.createElement(
                "article"
            );

        card.className =
            "result-card";

        card.innerHTML = `

            <div class="result-head">

                <div>
                    <p class="filename">
                        ${escapeHtml(filename)}
                    </p>

                    <p class="timing">
                        Analysis error
                    </p>
                </div>

                <span class="status review">
                    REVIEW
                </span>

            </div>


            <div class="error-box">
                <strong>Engine error</strong>

                <p>
                    ${escapeHtml(message)}
                </p>
            </div>

        `;

        resultsList.prepend(card);
    }


    // ----------------------------------------------------------
    // PROCESS ONE
    // ----------------------------------------------------------

    // SEND ONE QUEUED LABEL TO THE BACKEND, COLLECT THE RESPONSE, AND UPDATE ALL UI STATE FOR THAT ITEM.
    async function analyzeQueueItem(
        item,
        index
    ) {
        item.status = "processing";
        item.startedAt =
            performance.now();

        renderQueue();
        refreshActiveStatus();

        const formData =
            new FormData();

        formData.append(
            "engine",
            selectedEngineValue()
        );

        const applicationMetadata =
            applicationForms
                .filter(
                    record =>
                        record.status
                        ===
                        "ready"
                        &&
                        record.extracted
                )
                .map(
                    record =>
                        record.extracted
                );

        formData.append(
            "applications_json",
            JSON.stringify(
                applicationMetadata
            )
        );

        formData.append(
            "label",
            item.file
        );

        /*
         * EACH ACTIVE LABEL GETS ITS OWN CONTROLLER SO STOP CAN ABORT
         * ALL IN-FLIGHT FETCHES IMMEDIATELY.
         */
        const controller =
            new AbortController();

        activeAnalysisControllers.set(
            index,
            controller
        );

        try {
            const response =
                await fetch(
                    "/api/analyze-one",
                    {
                        method: "POST",
                        body: formData,
                        signal: controller.signal
                    }
                );

            /*
             * STOP MAY BE PRESSED JUST AS THE SERVER RETURNS. DO NOT ACCEPT
             * OR RENDER A LATE RESULT AFTER THE USER HAS STOPPED THE BATCH.
             */
            if (item.status === "skipped") {
                return;
            }

            if (
                stopRequested
                ||
                pauseRequested
            ) {
                item.status = "waiting";
                item.resultStatus = null;
                item.payload = null;
                return;
            }

            const payload =
                await response.json();

            if (
                !response.ok
                ||
                !payload.ok
            ) {
                throw new Error(
                    payload.error
                    ||
                    "Analysis failed."
                );
            }

            if (item.status === "skipped") {
                return;
            }

            if (
                stopRequested
                ||
                pauseRequested
            ) {
                item.status = "waiting";
                item.resultStatus = null;
                item.payload = null;
                return;
            }

            item.status = "complete";

            item.resultStatus =
                payload
                    .verification
                    .overall_status;

            item.payload = payload;

            refreshApplicationMatchDisplay();

            if (
                item.resultStatus
                ===
                "PASS"
            ) {
                summary.passed++;
            }
            else if (
                item.resultStatus
                ===
                "FAIL"
            ) {
                summary.failed++;
            }
            else {
                summary.review++;
            }

            appendResult(
                payload,
                item
            );

            selectQueueItem(index);
        }
        catch (error) {

            /*
             * AN ABORT IS AN INTENTIONAL STOP, NOT AN ANALYSIS ERROR.
             * RETURN THE ITEM TO WAITING SO A LATER Analyze CLICK CAN START
             * A FRESH BATCH WITHOUT AN ERROR CARD OR REVIEW COUNT.
             */
            if (item.status === "skipped") {
                return;
            }

            if (
                error?.name === "AbortError"
                ||
                controller.signal.aborted
                ||
                stopRequested
                ||
                pauseRequested
            ) {
                item.status = "waiting";
                item.resultStatus = null;
                item.payload = null;
                return;
            }

            item.status = "error";
            item.resultStatus = "ERROR";
            summary.review++;

            appendErrorResult(
                item.file.name,
                error.message
            );
        }
        finally {
            activeAnalysisControllers.delete(
                index
            );

            item.startedAt = null;

            updateSummary();
            renderQueue();
            refreshActiveStatus();
        }
    }


    // ----------------------------------------------------------
    // WORKER POOL
    // ----------------------------------------------------------

    // ATOMICALLY CLAIM THE NEXT WAITING QUEUE ITEM FOR ONE WORKER.
    function claimNextWaitingItem() {
        if (
            pauseRequested
            ||
            stopRequested
        ) {
            return null;
        }

        const index =
            queue.findIndex(
                item =>
                    item.status
                    ===
                    "waiting"
            );

        if (index === -1) {
            return null;
        }

        // MARK IMMEDIATELY SO ANOTHER WORKER CANNOT CLAIM IT.
        queue[index].status =
            "claimed";

        return {
            item: queue[index],
            index
        };
    }


    // REPEATEDLY CLAIM AND ANALYZE QUEUE ITEMS UNTIL NONE REMAIN OR PROCESSING IS STOPPED.
    async function workerLoop() {
        while (true) {

            if (
                pauseRequested
                ||
                stopRequested
            ) {
                return;
            }

            const claimed =
                claimNextWaitingItem();

            if (!claimed) {
                return;
            }

            await analyzeQueueItem(
                claimed.item,
                claimed.index
            );
        }
    }


    // COORDINATE THE FULL BATCH RUN, WORKER POOL, COMPLETION SUMMARY, AND CLEANUP.
    async function runQueue() {
        if (running) {
            return;
        }

        running = true;
        paused = false;

        setRunningControls();

        batchState.textContent =
            "RUNNING";

        currentEngine.textContent =
            selectedEngineLabel();

        currentMode.textContent =
            selectedProcessingMode()
            ===
            "parallel"
                ?
                "Parallel"
                :
                "Sequential";

        const concurrency =
            selectedConcurrency();

        currentConcurrency.textContent =
            selectedProcessingMode()
            ===
            "parallel"
                ?
                `${concurrency} at a time`
                :
                "1 at a time";

        const readyApplications =
            applicationForms.filter(
                record =>
                    record.status
                    ===
                    "ready"
            ).length;

        currentApplication.textContent =
            `${readyApplications} application form(s) loaded · AI content matching`;

        controlMessage.textContent = "";

        if (batchStartedAt === null) {
            batchStartedAt =
                performance.now();
        }

        startElapsedTimer();

        const workerCount =
            Math.min(
                concurrency,
                Math.max(
                    queue.filter(
                        item =>
                            item.status
                            ===
                            "waiting"
                    ).length,
                    1
                )
            );

        await Promise.all(
            Array.from(
                {
                    length: workerCount
                },
                () => workerLoop()
            )
        );

        running = false;

        if (stopRequested) {
            /*
             * THE STOP BUTTON ALREADY UPDATED THE UI AND ABORTED REQUESTS.
             * THIS BRANCH ONLY COMPLETES THE ASYNC COORDINATOR CLEANUP.
             */
            stopRequested = false;
            pauseRequested = false;
            running = false;

            stopElapsedTimer();
            setIdleControls();
            renderQueue();
            refreshActiveStatus();
            return;
        }

        if (pauseRequested) {
            paused = true;
            pauseRequested = false;

            batchState.textContent =
                "PAUSED";

            controlMessage.textContent =
                "Paused. Interrupted labels will restart when resumed.";

            stopElapsedTimer();
            setPausedControls();
            refreshActiveStatus();
            return;
        }

        const stillWaiting =
            queue.some(
                item =>
                    item.status
                    ===
                    "waiting"
            );

        if (stillWaiting) {
            // CAN HAPPEN ONLY IF A STATE CHANGE OCCURRED BETWEEN WORKERS.
            runQueue();
            return;
        }

        batchState.textContent =
            "COMPLETE";

        controlMessage.textContent =
            "Batch complete.";

        stopElapsedTimer();

        activeCount.textContent = "0";
        activeFiles.textContent =
            "No images";

        currentConcurrency.textContent =
            "—";

        currentMode.textContent =
            "—";

        currentEngine.textContent =
            "—";

        if (
            announceComplete.checked
        ) {
            await speakSummary();
        }

        batchStartedAt = null;

        setIdleControls();
        updateEta();
    }


    // ----------------------------------------------------------
    // START / PAUSE / RESUME / STOP
    // ----------------------------------------------------------

    analyzeButton.addEventListener(
        "click",
        () => {

            if (queue.length === 0) {
                controlMessage.textContent =
                    "Choose at least one label image first.";
                return;
            }

            const readyApplications =
                applicationForms.filter(
                    record =>
                        record.status
                        ===
                        "ready"
                );

            if (
                readyApplications.length
                ===
                0
            ) {
                controlMessage.textContent =
                    "Add at least one readable application PDF first.";
                return;
            }

            queue.forEach(
                item => {
                    item.status = "waiting";
                    item.resultStatus = null;
                    item.payload = null;
                    item.startedAt = null;
                }
            );

            pauseRequested = false;
            stopRequested = false;
            paused = false;
            batchStartedAt = null;

            summary.passed = 0;
            summary.failed = 0;
            summary.review = 0;

            updateSummary();

            resultsList.innerHTML = "";
            extractionDetails.innerHTML = "";

            extractionSelectedFile.textContent =
                "No completed extraction";

            batchElapsed.textContent =
                "0.0 sec";

            renderQueue();
            renderApplicationForms();
            updateEta();
            runQueue();
        }
    );


    /*
     * RETURN THE LABEL THAT "SKIP CURRENT" SHOULD CANCEL.
     *
     * In sequential mode there is only one active label.
     * In parallel mode:
     *   1. prefer the selected active label;
     *   2. otherwise skip the oldest active label.
     */
    function currentSkippableItem() {

        let index =
            queue.findIndex(
                item =>
                    item.selected
                    &&
                    item.status === "processing"
            );

        if (index < 0) {
            let oldestStartedAt =
                Number.POSITIVE_INFINITY;

            queue.forEach(
                (item, itemIndex) => {
                    if (
                        item.status === "processing"
                        &&
                        Number.isFinite(
                            item.startedAt
                        )
                        &&
                        item.startedAt < oldestStartedAt
                    ) {
                        oldestStartedAt =
                            item.startedAt;

                        index =
                            itemIndex;
                    }
                }
            );
        }

        if (index < 0) {
            return null;
        }

        return {
            item: queue[index],
            index
        };
    }


    /*
     * SKIP ONLY ONE ACTIVE LABEL AND KEEP THE BATCH MOVING.
     * The active HTTP request is aborted, the label becomes SKIPPED, and the
     * worker immediately continues to the next WAITING label.
     */
    skipButton.addEventListener(
        "click",
        () => {

            if (
                !running
                ||
                pauseRequested
                ||
                stopRequested
            ) {
                return;
            }

            const target =
                currentSkippableItem();

            if (!target) {
                controlMessage.textContent =
                    "No active label is available to skip.";

                return;
            }

            const {
                item,
                index
            } = target;

            item.status =
                "skipped";

            item.resultStatus =
                "SKIPPED";

            item.payload = null;
            item.startedAt = null;

            const controller =
                activeAnalysisControllers.get(
                    index
                );

            if (controller) {
                try {
                    controller.abort();
                }
                catch {
                    // The request may have completed between click and abort.
                }
            }

            activeAnalysisControllers.delete(
                index
            );

            controlMessage.textContent =
                `Skipped ${item.file.name}. Continuing with the batch.`;

            renderQueue();
            refreshActiveStatus();
            updateProgress();
        }
    );


    pauseButton.addEventListener(
        "click",
        () => {

            if (!running) {
                return;
            }

            /*
             * HARD PAUSE:
             * - prevent new claims immediately,
             * - abort every active browser analysis request,
             * - return interrupted labels to WAITING,
             * - freeze elapsed timing immediately.
             *
             * The interrupted label restarts from the beginning on Resume.
             * Remote HTTP/model inference cannot resume mid-request.
             */
            pauseRequested = true;
            stopRequested = false;

            activeAnalysisControllers.forEach(
                controller => {
                    try {
                        controller.abort();
                    }
                    catch {
                        // A request may already have completed.
                    }
                }
            );

            activeAnalysisControllers.clear();

            queue.forEach(
                item => {
                    if (
                        item.status === "processing"
                        ||
                        item.status === "claimed"
                    ) {
                        item.status = "waiting";
                        item.resultStatus = null;
                        item.payload = null;
                        item.startedAt = null;
                    }
                }
            );

            batchState.textContent =
                "PAUSED";

            controlMessage.textContent =
                "Paused immediately. Active analysis requests were cancelled.";

            stopElapsedTimer();

            /*
             * Avoid a Resume race while the aborted worker promises unwind.
             * runQueue() enables Resume as soon as cleanup completes.
             */
            pauseButton.disabled = true;
            resumeButton.disabled = true;
            stopButton.disabled = false;

            renderQueue();
            refreshActiveStatus();
        }
    );


    resumeButton.addEventListener(
        "click",
        () => {

            if (!paused) {
                return;
            }

            paused = false;

            batchState.textContent =
                "RUNNING";

            controlMessage.textContent =
                "Resuming batch...";

            runQueue();
        }
    );


    stopButton.addEventListener(
        "click",
        () => {

            if (
                !running
                &&
                !paused
            ) {
                return;
            }

            /*
             * DEAD STOP:
             * 1. prevent any worker from claiming another item,
             * 2. abort every active browser request,
             * 3. immediately update the UI,
             * 4. ignore any late server response that may already be finishing.
             */
            stopRequested = true;
            pauseRequested = false;
            paused = false;

            activeAnalysisControllers.forEach(
                controller => {
                    try {
                        controller.abort();
                    }
                    catch {
                        // A controller may already have completed.
                    }
                }
            );

            activeAnalysisControllers.clear();

            /*
             * ACTIVE/CLAIMED ITEMS GO BACK TO WAITING INSTEAD OF BECOMING
             * FALSE ERROR/REVIEW RESULTS.
             */
            queue.forEach(
                item => {
                    if (
                        item.status === "processing"
                        ||
                        item.status === "claimed"
                    ) {
                        item.status = "waiting";
                        item.resultStatus = null;
                        item.payload = null;
                        item.startedAt = null;
                    }
                }
            );

            running = false;

            batchState.textContent =
                "STOPPED";

            controlMessage.textContent =
                "Batch stopped immediately.";

            batchStartedAt = null;

            stopElapsedTimer();

            setIdleControls();
            renderQueue();
            refreshActiveStatus();

            /*
             * ALSO STOP ANY VOICE PLAYBACK/ANNOUNCEMENT THAT MAY BE ACTIVE.
             */
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
            }

            if ("speechSynthesis" in window) {
                window.speechSynthesis.cancel();
            }
        }
    );


    exportCsvButton.addEventListener(
        "click",
        () => {
            exportBatchReport(
                "csv"
            );
        }
    );


    exportPdfButton.addEventListener(
        "click",
        () => {
            exportBatchReport(
                "pdf"
            );
        }
    );


    // ----------------------------------------------------------
    // KOKORO VOICE
    // ----------------------------------------------------------

    // USE THE BROWSER SPEECH ENGINE WHEN SERVER-SIDE KOKORO AUDIO IS UNAVAILABLE.
    function browserVoiceFallback(text) {

        return new Promise(
            resolve => {

                if (
                    !(
                        "speechSynthesis"
                        in
                        window
                    )
                ) {
                    resolve(false);
                    return;
                }

                const voices =
                    window.speechSynthesis.getVoices();

                const voice =
                    voices.find(
                        item =>
                            item.lang
                                .toLowerCase()
                                .startsWith("en-gb")
                    )
                    ||
                    voices.find(
                        item =>
                            item.lang
                                .toLowerCase()
                                .startsWith("en")
                    )
                    ||
                    null;

                const utterance =
                    new SpeechSynthesisUtterance(
                        text
                    );

                if (voice) {
                    utterance.voice = voice;
                }

                utterance.lang =
                    voice?.lang || "en-GB";

                utterance.rate = 0.94;
                utterance.pitch = 0.94;

                utterance.onend =
                    () => resolve(true);

                utterance.onerror =
                    () => resolve(false);

                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(
                    utterance
                );

            }
        );
    }


    // REQUEST SERVER-SIDE SPEECH AUDIO AND FALL BACK TO BROWSER SPEECH IF NECESSARY.
    async function speakText(text) {

        try {
            controlMessage.textContent =
                "Generating Kokoro voice announcement...";

            voiceStatus.textContent =
                "Kokoro · generating...";

            const response =
                await fetch(
                    "/api/speak",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            text
                        })
                    }
                );

            if (!response.ok) {

                let message =
                    "Kokoro voice unavailable.";

                try {
                    const data =
                        await response.json();

                    message =
                        data.error
                        ||
                        message;
                }
                catch {
                    // USE FALLBACK MESSAGE.
                }

                throw new Error(message);
            }

            const blob =
                await response.blob();

            const url =
                URL.createObjectURL(blob);

            if (currentAudio) {
                currentAudio.pause();

                if (currentAudio.src) {
                    URL.revokeObjectURL(
                        currentAudio.src
                    );
                }
            }

            currentAudio =
                new Audio(url);

            currentAudio.onended =
                () => {
                    URL.revokeObjectURL(url);
                    controlMessage.textContent = "";
                    voiceStatus.textContent =
                        "Kokoro · British male";
                };

            currentAudio.onerror =
                async () => {
                    URL.revokeObjectURL(url);

                    const fallbackWorked =
                        await browserVoiceFallback(
                            text
                        );

                    voiceStatus.textContent =
                        fallbackWorked
                            ?
                            "British browser fallback"
                            :
                            "Voice unavailable";

                    controlMessage.textContent =
                        fallbackWorked
                            ?
                            "Kokoro playback failed; browser voice used."
                            :
                            "Voice playback failed.";
                };

            await currentAudio.play();

            voiceStatus.textContent =
                "Kokoro · British male";

            controlMessage.textContent =
                "Playing voice announcement...";

            return true;
        }
        catch (error) {

            /*
                DO NOT FAIL SILENTLY. IF KOKORO IS MISSING, MISCONFIGURED, OR
                CANNOT PLAY, ATTEMPT THE BROWSER'S BRITISH ENGLISH TTS.
            */
            const fallbackWorked =
                await browserVoiceFallback(
                    text
                );

            voiceStatus.textContent =
                fallbackWorked
                    ?
                    "British browser fallback"
                    :
                    "Voice unavailable";

            controlMessage.textContent =
                fallbackWorked
                    ?
                    `Kokoro unavailable; browser voice used.`
                    :
                    error.message;

            return fallbackWorked;
        }
    }


    // OPEN THE HELP MODAL AND LOAD THE README AS SAFE PLAIN TEXT.
    async function openHelpModal() {
        helpModal.classList.add("open");
        helpModal.setAttribute("aria-hidden", "false");
        document.body.classList.add("help-open");
        helpCloseButton.focus();

        if (
            helpReadmeContent.dataset.loaded
            ===
            "true"
        ) {
            return;
        }

        helpReadmeContent.textContent =
            "Loading README...";

        try {
            const response = await fetch("/api/readme");

            if (!response.ok) {
                throw new Error(
                    "README could not be loaded."
                );
            }

            helpReadmeContent.textContent =
                await response.text();

            helpReadmeContent.dataset.loaded =
                "true";
        }
        catch (error) {
            helpReadmeContent.textContent =
                error.message;
        }
    }


    // CLOSE THE HELP MODAL AND RETURN KEYBOARD FOCUS TO THE HELP BUTTON.
    function closeHelpModal() {
        helpModal.classList.remove("open");
        helpModal.setAttribute("aria-hidden", "true");
        document.body.classList.remove("help-open");
        helpButton.focus();
    }


    helpButton.addEventListener(
        "click",
        openHelpModal
    );


    helpCloseButton.addEventListener(
        "click",
        closeHelpModal
    );


    helpModal.addEventListener(
        "click",
        event => {
            if (
                event.target
                    .matches("[data-help-close]")
            ) {
                closeHelpModal();
            }
        }
    );


    document.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Escape"
                &&
                helpModal.classList.contains("open")
            ) {
                closeHelpModal();
            }
        }
    );


    testVoiceButton.addEventListener(
        "click",
        async () => {

            await speakText(
                "Voice announcement test. The alcohol label verification system is ready."
            );

        }
    );


    // BUILD AND SPEAK A CONCISE SUMMARY OF THE COMPLETED BATCH RESULTS.
    async function speakSummary() {
        const total =
            summary.passed
            +
            summary.failed
            +
            summary.review;

        const message =
            `Batch processing complete. `
            +
            `${total} labels were processed. `
            +
            `${summary.passed} passed verification. `
            +
            `${summary.failed} failed verification. `
            +
            `${summary.review} require manual review.`;

        await speakText(message);
    }


    speakButton.addEventListener(
        "click",
        speakSummary
    );


    // ----------------------------------------------------------
    // INITIALIZE
    // ----------------------------------------------------------

    updateConfigurationUi();
    renderQueue();
    updateSummary();
    updateEta();

})();
