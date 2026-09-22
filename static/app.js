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

    const dropZone =
        document.getElementById("drop-zone");

    const browseFilesButton =
        document.getElementById("browse-files-button");

    const analyzeButton =
        document.getElementById("analyze-button");

    const pauseButton =
        document.getElementById("pause-button");

    const resumeButton =
        document.getElementById("resume-button");

    const stopButton =
        document.getElementById("stop-button");

    const speakButton =
        document.getElementById("speak-summary");

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
                    "WAITING"
            )
        );
    }


    // RENDER THE COMPLETE IMAGE QUEUE USING THE CURRENTLY SELECTED GRID/DETAILS VIEW.
    function renderQueue() {
        queueList.classList.toggle(
            "grid-view",
            uploadView === "grid"
        );

        queueList.classList.toggle(
            "details-view",
            uploadView === "details"
        );

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
                                EXISTING ANALYSIS RESULTS USED THE PREVIOUS
                                APPLICATION POOL. CLEAR THEM SO THE UI NEVER
                                PRESENTS A STALE MATCH AFTER A PDF IS REMOVED.
                            */
                            queue.forEach(
                                item => {
                                    item.payload = null;
                                    item.resultStatus = null;

                                    if (
                                        item.status
                                        ===
                                        "complete"
                                    ) {
                                        item.status =
                                            "waiting";
                                    }
                                }
                            );

                            renderApplicationForms();
                            renderQueue();

                        }
                    );

                }
            );
    }


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
        stopButton.disabled = false;
    }


    // PUT CONTROLS INTO THE PAUSED STATE WHILE ALLOWING A LATER RESUME.
    function setPausedControls() {
        analyzeButton.disabled = true;

        pauseButton.disabled = true;
        resumeButton.disabled = false;
        stopButton.disabled = false;
    }


    // RESTORE CONTROLS TO THE NORMAL IDLE STATE AFTER PROCESSING ENDS.
    function setIdleControls() {
        analyzeButton.disabled = false;

        disableConfiguration(false);

        pauseButton.disabled = true;
        resumeButton.disabled = true;
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

        try {
            const response =
                await fetch(
                    "/api/analyze-one",
                    {
                        method: "POST",
                        body: formData
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
                    "Analysis failed."
                );
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
            item.status = "error";
            item.resultStatus = "ERROR";
            summary.review++;

            appendErrorResult(
                item.file.name,
                error.message
            );
        }
        finally {
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
            batchState.textContent =
                "STOPPED";

            controlMessage.textContent =
                "Batch stopped after active labels finished.";

            stopRequested = false;
            pauseRequested = false;

            stopElapsedTimer();
            setIdleControls();
            refreshActiveStatus();
            return;
        }

        if (pauseRequested) {
            paused = true;
            pauseRequested = false;

            batchState.textContent =
                "PAUSED";

            controlMessage.textContent =
                "Paused after active labels finished.";

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

            /*
                IF THE USER REQUESTED A COMPLETION ANNOUNCEMENT, START LOADING
                CLIENT-SIDE KOKORO NOW SO MODEL INITIALIZATION OVERLAPS WITH
                LABEL PROCESSING INSTEAD OF STARTING AFTER THE BATCH FINISHES.
            */
            if (
                announceComplete.checked
                &&
                isHostedDeployment()
            ) {
                warmBrowserKokoro();
            }

            runQueue();
        }
    );


    pauseButton.addEventListener(
        "click",
        () => {

            if (!running) {
                return;
            }

            pauseRequested = true;

            pauseButton.disabled = true;

            batchState.textContent =
                "PAUSE REQUESTED";

            controlMessage.textContent =
                "No new labels will start. Active labels will finish.";
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

            if (paused) {
                paused = false;

                batchState.textContent =
                    "STOPPED";

                controlMessage.textContent =
                    "Batch stopped.";

                batchStartedAt = null;

                setIdleControls();
                return;
            }

            stopRequested = true;
            pauseRequested = false;

            batchState.textContent =
                "STOP REQUESTED";

            controlMessage.textContent =
                "No new labels will start. Active labels will finish.";
        }
    );


    // ----------------------------------------------------------
    // KOKORO VOICE
    // ----------------------------------------------------------

    // RETURN TRUE WHEN THE APP IS RUNNING ON A REMOTE/HOSTED ORIGIN.
    function isHostedDeployment() {
        return !(
            window.location.hostname === "localhost"
            ||
            window.location.hostname === "127.0.0.1"
        );
    }


    /*
     * PLAY A BLOB THROUGH THE EXISTING SINGLE-AUDIO-INSTANCE PATH.
     * REVOKING THE OBJECT URL PREVENTS GENERATED AUDIO FROM ACCUMULATING
     * IN BROWSER MEMORY.
     */
    async function playVoiceBlob(blob, readyLabel) {

        const url =
            URL.createObjectURL(blob);

        if (currentAudio) {
            currentAudio.pause();

            if (
                currentAudio.src
                &&
                currentAudio.src.startsWith("blob:")
            ) {
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
                    readyLabel;
            };

        currentAudio.onerror =
            () => {
                URL.revokeObjectURL(url);
            };

        await currentAudio.play();

        voiceStatus.textContent =
            readyLabel;

        controlMessage.textContent =
            "Playing voice announcement...";

        return true;
    }


    /*
     * PRELOAD KOKORO IN THE REVIEWER'S BROWSER WHILE THE BATCH IS RUNNING.
     * THIS OVERLAPS MODEL DOWNLOAD/INITIALIZATION WITH LABEL ANALYSIS.
     */
    async function warmBrowserKokoro() {

        if (
            !isHostedDeployment()
            ||
            !window.KokoroBrowser?.warmup
        ) {
            return false;
        }

        try {
            voiceStatus.textContent =
                "Kokoro · preparing browser acceleration...";

            const result =
                await window.KokoroBrowser.warmup();

            voiceStatus.textContent =
                "Kokoro · WebGPU ready · British male";

            return true;
        }
        catch (error) {
            console.warn(
                "Browser Kokoro warmup failed.",
                error
            );

            voiceStatus.textContent =
                "British browser fallback";

            return false;
        }
    }


    /*
     * GENERATE HIGH-QUALITY KOKORO SPEECH IN THE BROWSER USING WEBGPU.
     * IF WEBGPU IS UNAVAILABLE, hosted voice is reported as unavailable.
     * No browser/system speech fallback is used in the hosted build.
     */
    async function browserKokoroVoice(text) {

        if (!window.KokoroBrowser?.synthesize) {
            return false;
        }

        voiceStatus.textContent =
            "Kokoro · WebGPU generating · British male...";

        controlMessage.textContent =
            "Generating Kokoro voice in this browser...";

        const result =
            await window.KokoroBrowser.synthesize(
                text
            );

        const readyLabel =
            "Kokoro · WebGPU · British male";

        return playVoiceBlob(
            result.blob,
            readyLabel
        );
    }


    // USE THE BROWSER SPEECH ENGINE WHEN KOKORO AUDIO IS UNAVAILABLE.
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

                const preferredFemaleNames = [
                    "sonia", "libby", "hazel", "serena", "susan",
                    "aria", "zira", "samantha", "fiona", "moira",
                    "tessa", "emily", "karen"
                ];

                const voice =
                    voices.find(
                        item =>
                            item.lang.toLowerCase().startsWith("en-gb")
                            &&
                            preferredFemaleNames.some(
                                name =>
                                    item.name.toLowerCase().includes(name)
                            )
                    )
                    ||
                    voices.find(
                        item =>
                            item.lang.toLowerCase().startsWith("en")
                            &&
                            preferredFemaleNames.some(
                                name =>
                                    item.name.toLowerCase().includes(name)
                            )
                    )
                    ||
                    voices.find(
                        item =>
                            item.lang.toLowerCase().startsWith("en-gb")
                    )
                    ||
                    voices.find(
                        item =>
                            item.lang.toLowerCase().startsWith("en")
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


    /*
     * SPEAK TEXT USING THE BEST RUNTIME FOR THE CURRENT ENVIRONMENT.
     *
     * Hosted Railway:
     *   Browser Kokoro WebGPU (FP32) only
     *
     * Local workstation:
     *   Existing FastAPI/Kokoro ONNX endpoint -> browser SpeechSynthesis
     *
     * Hosted speech therefore does not consume Railway CPU for synthesis.
     */
    async function speakText(text) {

        if (isHostedDeployment()) {

            try {
                const worked =
                    await browserKokoroVoice(
                        text
                    );

                if (worked) {
                    return true;
                }
            }
            catch (error) {
                console.warn(
                    "Browser Kokoro synthesis failed.",
                    error
                );
            }

            voiceStatus.textContent =
                "Kokoro WebGPU unavailable";

            controlMessage.textContent =
                "Voice unavailable: this hosted build requires WebGPU Kokoro.";

            return false;
        }

        /*
            LOCAL DEVELOPMENT KEEPS THE EXISTING SERVER-SIDE KOKORO PATH
            BECAUSE IT CAN USE THE DEVELOPER'S LOCAL MACHINE DIRECTLY.
        */
        try {
            controlMessage.textContent =
                "Generating local Kokoro voice announcement...";

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

            return await playVoiceBlob(
                blob,
                "Kokoro · British male"
            );
        }
        catch (error) {

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
                    "Local Kokoro unavailable; browser voice used."
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
