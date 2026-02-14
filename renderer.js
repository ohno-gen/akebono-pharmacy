const ROW_HEIGHT_PX = 108;
const DISPLAY_ROW_COUNT = 5;
const DEFAULT_STABLE_X_PX = 300;
const STABLE_VIDEO_ENTRY_OFFSET_PX = 500;
const STABLE_VIDEO_SLIDE_DURATION_MS = 4000;
const FALLBACK_VIDEO_ASPECT = 16 / 9;

const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let SerialPort = null;
try {
    ({ SerialPort } = require('serialport'));
} catch (error) {
    console.error('serialport load failed:', error);
}

const VIDEO_BASENAME = 'agent-output';
const VIDEO_EXTENSIONS = ['webm', 'mov', 'mp4'];
const PRICE_TAG_LAYER_ID = 'priceTagLayer';
const DISPLAY_WIDTH_PX = 1920;
const SENSOR_SERIAL_BAUD_RATE = 115200;
const SENSOR_SERIAL_PORT_OVERRIDE = (process.env.SENSOR_SERIAL_PORT || '').trim();

let sensorSerialPort = null;
let sensorSerialBuffer = '';
let sensorRestartLocked = false;
let sensorRestartPendingEnds = 0;

const videoPool = new Map();
let stableVideoXByRow = [950, 350, 950, 300, 300];
const PRICE_TAG_COUNTS = [17, 14, 0, 0, 0];
const PRICE_TAG_X_POSITIONS = [
    generateEvenXPositions(PRICE_TAG_COUNTS[0], DISPLAY_WIDTH_PX, 16, 16),
    generateEvenXPositions(PRICE_TAG_COUNTS[1], DISPLAY_WIDTH_PX, 16, 16),
    [],
    [],
    []
];

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function generateEvenXPositions(count, widthPx, leftPadding = 0, rightPadding = 0) {
    const total = Math.max(0, count);
    if (total === 0) {
        return [];
    }
    const usableWidth = Math.max(0, widthPx - leftPadding - rightPadding);
    if (total === 1) {
        return [Math.round(leftPadding + usableWidth / 2)];
    }
    const step = usableWidth / (total - 1);
    return Array.from({ length: total }, (_, i) => Math.round(leftPadding + step * i));
}

function getResolvedPriceTagPositions(rowIndex) {
    const count = PRICE_TAG_COUNTS[rowIndex] || 0;
    if (count <= 0) {
        return [];
    }
    const basePositions = Array.isArray(PRICE_TAG_X_POSITIONS[rowIndex])
        ? PRICE_TAG_X_POSITIONS[rowIndex]
        : [];
    const fallbackPositions = generateEvenXPositions(count, DISPLAY_WIDTH_PX, 16, 16);
    const resolved = [];

    for (let i = 0; i < count; i += 1) {
        const raw = basePositions[i];
        resolved.push(Number.isFinite(raw) ? raw : (fallbackPositions[i] || 0));
    }
    return resolved;
}

function debugLog(message) {
    const ts = new Date().toISOString();
    const line = `[renderer ${ts}] ${message}`;
    if (ipcRenderer && typeof ipcRenderer.send === 'function') {
        ipcRenderer.send('debug-log', line);
    }
    console.log(line);
}

function resolveVideoFileUrl() {
    const baseDir = path.join(__dirname, 'assets', 'media');
    for (const ext of VIDEO_EXTENSIONS) {
        const filePath = path.join(baseDir, `${VIDEO_BASENAME}.${ext}`);
        if (fs.existsSync(filePath)) {
            return pathToFileURL(filePath).toString();
        }
    }
    debugLog(`video file missing: ${path.join(baseDir, `${VIDEO_BASENAME}.[${VIDEO_EXTENSIONS.join(',')}]`)}`);
    return null;
}

function resolvePriceTagFileUrl(rowNumber, index) {
    const filePath = path.join(__dirname, 'assets', 'media', 'price-tag', `price${rowNumber}_${index}.png`);
    if (!fs.existsSync(filePath)) {
        debugLog(`price tag missing: ${filePath}`);
        return null;
    }
    return pathToFileURL(filePath).toString();
}

function getTemplateVideo() {
    return document.getElementById('stableVideo');
}

function getVideoForRow(row) {
    if (videoPool.has(row)) {
        return videoPool.get(row);
    }
    const template = getTemplateVideo();
    if (!template) {
        return null;
    }

    let video;
    if (row === 0 && !template.dataset.pooled) {
        video = template;
        template.dataset.pooled = 'true';
    } else {
        video = template.cloneNode(true);
        video.id = `${template.id}-r${row}`;
        video.classList.add('pooled-video');
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        video.loop = false;
        video.pause();
        video.currentTime = 0;
        if (template.parentNode) {
            template.parentNode.appendChild(video);
        }
        try {
            video.load();
        } catch (e) {
            // ignore
        }
    }

    videoPool.set(row, video);
    return video;
}

function getVideoAspectRatio(video, fallback = FALLBACK_VIDEO_ASPECT) {
    if (!video) {
        return fallback;
    }
    const { videoWidth, videoHeight } = video;
    if (videoWidth > 0 && videoHeight > 0) {
        return videoWidth / videoHeight;
    }
    return fallback;
}

function getStableVideoXForRow(row) {
    const x = stableVideoXByRow[row];
    return Number.isFinite(x) ? x : DEFAULT_STABLE_X_PX;
}

function calculateStableVideoPlacement(row, x, video) {
    const container = document.querySelector('.container');
    if (!container) {
        debugLog('placement failed: container not found');
        return null;
    }

    const containerRect = container.getBoundingClientRect();
    const containerWidth = containerRect.width || container.offsetWidth || container.clientWidth || window.innerWidth;
    const containerHeight = containerRect.height
        || container.offsetHeight
        || container.clientHeight
        || (ROW_HEIGHT_PX * DISPLAY_ROW_COUNT);
    const height = ROW_HEIGHT_PX;
    const width = height * getVideoAspectRatio(video);
    const rawLeft = Number.isFinite(x) ? x : 0;
    const left = clamp(rawLeft, 0, containerWidth - width);
    const maxTop = Math.max(0, containerHeight - height);
    const top = clamp(row * ROW_HEIGHT_PX, 0, maxTop);

    return {
        row,
        left,
        top,
        width,
        height
    };
}

function ensurePriceTagLayer() {
    const container = document.querySelector('.container');
    if (!container) {
        return null;
    }
    let layer = document.getElementById(PRICE_TAG_LAYER_ID);
    if (!layer) {
        layer = document.createElement('div');
        layer.id = PRICE_TAG_LAYER_ID;
        layer.className = 'price-tag-layer';
        container.appendChild(layer);
    }
    return layer;
}

function loadAndResizeImage(src, heightPx) {
    const img = new Image();
    img.className = 'price-tag';
    img.style.height = `${heightPx}px`;
    img.style.width = 'auto';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';
    img.draggable = false;
    img.src = src;
    return img;
}

function buildPriceTags() {
    const layer = ensurePriceTagLayer();
    if (!layer) {
        debugLog('price tag layer missing');
        return;
    }
    layer.innerHTML = '';

    for (let rowIndex = 0; rowIndex < DISPLAY_ROW_COUNT; rowIndex += 1) {
        const count = PRICE_TAG_COUNTS[rowIndex] || 0;
        if (count <= 0) {
            continue;
        }
        const rowNumber = rowIndex + 1;
        const resolvedPositions = getResolvedPriceTagPositions(rowIndex);

        for (let i = 0; i < count; i += 1) {
            const src = resolvePriceTagFileUrl(rowNumber, i + 1);
            if (!src) {
                continue;
            }
            const img = loadAndResizeImage(src, ROW_HEIGHT_PX);
            const x = resolvedPositions[i] || 0;
            img.style.left = `${x}px`;
            img.style.top = `${rowIndex * ROW_HEIGHT_PX}px`;
            layer.appendChild(img);
        }
    }
}

function applyStableVideoEntry(video, row, targetX) {
    const placement = calculateStableVideoPlacement(row, targetX, video);
    if (!placement) {
        return null;
    }

    const startPlacement = calculateStableVideoPlacement(
        row,
        targetX + STABLE_VIDEO_ENTRY_OFFSET_PX,
        video
    ) || placement;

    video.style.position = 'absolute';
    video.style.display = 'block';
    video.style.zIndex = '1000';
    video.style.objectFit = 'contain';
    video.style.backgroundColor = 'transparent';
    video.style.transform = 'none';
    video.classList.add('playing');
    video.style.transition = 'none';
    video.style.left = `${startPlacement.left}px`;
    video.style.top = `${startPlacement.top}px`;
    video.style.width = `${startPlacement.width}px`;
    video.style.height = `${startPlacement.height}px`;
    void video.offsetWidth;
    video.style.transition = `top 0.3s ease, left ${STABLE_VIDEO_SLIDE_DURATION_MS}ms ease, width 0.3s ease, height 0.3s ease`;
    video.style.left = `${placement.left}px`;

    return placement;
}

function applyVideoPlacement(video, placement) {
    video.style.position = 'absolute';
    video.style.display = 'block';
    video.style.zIndex = '1000';
    video.style.objectFit = 'contain';
    video.style.backgroundColor = 'transparent';
    video.style.transform = 'none';
    video.classList.add('playing');
    video.style.transition = 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease';
    video.style.left = `${placement.left}px`;
    video.style.top = `${placement.top}px`;
    video.style.width = `${placement.width}px`;
    video.style.height = `${placement.height}px`;
}

function ensureStableVideoMetadataRecalc(video) {
    if (!video || video.videoWidth > 0 || video.videoHeight > 0) {
        return;
    }
    if (video._stableMetadataHandler) {
        return;
    }
    video._stableMetadataHandler = () => {
        delete video._stableMetadataHandler;
        recalculateStableVideoPlacements();
    };
    video.addEventListener('loadedmetadata', video._stableMetadataHandler, { once: true });
}

function recalculateStableVideoPlacements() {
    videoPool.forEach((video) => {
        if (!video || video.dataset.stable !== 'true') {
            return;
        }
        const row = parseInt(video.dataset.stableRow, 10);
        if (!Number.isFinite(row)) {
            return;
        }
        const placement = calculateStableVideoPlacement(row, getStableVideoXForRow(row), video);
        if (!placement) {
            return;
        }
        applyVideoPlacement(video, placement);
    });
}

function clearStableLoopHandler(video) {
    if (video && video._stableLoopHandler) {
        video.removeEventListener('ended', video._stableLoopHandler);
        delete video._stableLoopHandler;
    }
}

function releaseSensorRestartLock(reason) {
    sensorRestartLocked = false;
    sensorRestartPendingEnds = 0;
    if (reason) {
        debugLog(`sensor restart lock released (${reason})`);
    }
}

function clearSensorRestartUnlockHandler(video, countAsFinished = false) {
    if (!video || !video._sensorRestartUnlockHandler) {
        return;
    }
    video.removeEventListener('ended', video._sensorRestartUnlockHandler);
    delete video._sensorRestartUnlockHandler;
    if (countAsFinished && sensorRestartPendingEnds > 0) {
        sensorRestartPendingEnds -= 1;
        if (sensorRestartPendingEnds <= 0) {
            releaseSensorRestartLock('stopped before ended');
        }
    }
}

function setupStableLoopHandler(video) {
    clearStableLoopHandler(video);
    video._stableLoopHandler = () => {
        if (!video || video.dataset.stable !== 'true') {
            return;
        }
        const row = parseInt(video.dataset.stableRow, 10);
        if (!Number.isFinite(row)) {
            return;
        }
        const placement = applyStableVideoEntry(video, row, getStableVideoXForRow(row));
        if (!placement) {
            return;
        }
        video.currentTime = 0;
        ensureStableVideoMetadataRecalc(video);
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => console.error('Stable loop replay failed:', err));
        }
    };
    video.addEventListener('ended', video._stableLoopHandler);
}

function stopVideo(video) {
    if (!video) {
        return;
    }
    clearSensorRestartUnlockHandler(video, true);
    clearStableLoopHandler(video);
    video.pause();
    video.currentTime = 0;
    video.classList.remove('playing');
    video.style.display = 'none';
    if (video.dataset) {
        delete video.dataset.stable;
        delete video.dataset.stableRow;
    }
}

function playStableVideoForRow(row, options = {}) {
    const {
        allowToggleOff = true,
        forceRestart = false
    } = options;
    const video = getVideoForRow(row);
    if (!video) {
        debugLog(`video element not found for row ${row + 1}`);
        return false;
    }

    if (video.dataset.stable === 'true' && video.classList.contains('playing')) {
        if (forceRestart) {
            stopVideo(video);
        } else if (allowToggleOff) {
            debugLog(`toggle off row ${row + 1}`);
            stopVideo(video);
            return true;
        }
    }

    video.loop = false;
    clearStableLoopHandler(video);

    const placement = applyStableVideoEntry(video, row, getStableVideoXForRow(row));
    if (!placement) {
        debugLog(`placement failed for row ${row + 1}`);
        return false;
    }

    video.dataset.stable = 'true';
    video.dataset.stableRow = String(row);
    video.muted = true;
    debugLog(
        `play row ${row + 1} top=${Math.round(placement.top)} left=${Math.round(placement.left)} src=${video.currentSrc || video.src || 'n/a'}`
    );
    video.currentTime = 0;
    try {
        video.load();
    } catch (e) {
        // ignore
    }
    ensureStableVideoMetadataRecalc(video);
    setupStableLoopHandler(video);

    const playPromise = video.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.error('Error playing stable video:', error);
            debugLog(`play error row ${row + 1}: ${error?.message || error}`);
            try {
                video.load();
                video.play().catch(err => console.error('Retry stable play failed:', err));
            } catch (e) {
                // ignore
            }
        });
    }
    return true;
}

function restartPlayingStableVideosFromBeginning() {
    if (sensorRestartLocked) {
        debugLog('sensor detected: ignored (waiting one full playback)');
        return;
    }

    const activeVideos = [];
    videoPool.forEach((video) => {
        if (!video || video.dataset.stable !== 'true' || !video.classList.contains('playing')) {
            return;
        }
        activeVideos.push(video);
    });

    if (activeVideos.length === 0) {
        debugLog('sensor detected: no active video to restart');
        return;
    }

    sensorRestartLocked = true;
    sensorRestartPendingEnds = activeVideos.length;

    let restarted = 0;
    activeVideos.forEach((video) => {
        clearSensorRestartUnlockHandler(video);
        video._sensorRestartUnlockHandler = () => {
            sensorRestartPendingEnds -= 1;
            if (sensorRestartPendingEnds <= 0) {
                releaseSensorRestartLock('playback ended');
            }
        };
        video.addEventListener('ended', video._sensorRestartUnlockHandler, { once: true });

        const row = parseInt(video.dataset.stableRow, 10);
        if (Number.isFinite(row)) {
            applyStableVideoEntry(video, row, getStableVideoXForRow(row));
        }

        video.pause();
        video.currentTime = 0;
        ensureStableVideoMetadataRecalc(video);
        const playPromise = video.play();
        if (playPromise !== undefined) {
            playPromise.catch((error) => {
                debugLog(`sensor restart play error: ${error?.message || error}`);
                clearSensorRestartUnlockHandler(video, true);
            });
        }
        restarted += 1;
    });
    debugLog(`sensor detected: restarted ${restarted} active video(s)`);
}

function handleSensorSerialLine(line) {
    const text = typeof line === 'string' ? line.trim() : '';
    if (!text) {
        return;
    }
    debugLog(`sensor serial: ${text}`);
    if (text === 'SENSOR_DETECTED') {
        restartPlayingStableVideosFromBeginning();
    }
}

function isLikelySensorPort(port) {
    const pathText = `${port?.path || ''}`.toLowerCase();
    const meta = `${port?.manufacturer || ''} ${port?.friendlyName || ''} ${port?.vendorId || ''} ${port?.productId || ''}`.toLowerCase();
    const haystack = `${pathText} ${meta}`;

    const looksLikeUsbSerial = haystack.includes('usbmodem')
        || haystack.includes('usbserial')
        || haystack.includes('wch')
        || haystack.includes('arduino')
        || haystack.includes('ch340')
        || haystack.includes('cp210');
    const clearlyNotDevice = haystack.includes('debug-console')
        || haystack.includes('bluetooth')
        || haystack.includes('tty.s')
        || haystack.includes('cu.s');

    return looksLikeUsbSerial && !clearlyNotDevice;
}

function formatPortSummary(port) {
    return `${port.path || 'n/a'}|${port.manufacturer || 'n/a'}|${port.friendlyName || 'n/a'}|${port.vendorId || 'n/a'}:${port.productId || 'n/a'}`;
}

async function initializeSensorSerial() {
    if (!SerialPort) {
        debugLog('serialport unavailable');
        return;
    }
    try {
        const ports = await SerialPort.list();
        if (!ports || ports.length === 0) {
            debugLog('serial port not found');
            return;
        }
        debugLog(`serial ports detected: ${ports.map(formatPortSummary).join(', ')}`);

        let preferred = null;
        if (SENSOR_SERIAL_PORT_OVERRIDE) {
            preferred = ports.find((port) => port.path === SENSOR_SERIAL_PORT_OVERRIDE) || null;
            if (!preferred) {
                debugLog(`serial override not found: ${SENSOR_SERIAL_PORT_OVERRIDE}`);
            }
        }
        if (!preferred) {
            preferred = ports.find(isLikelySensorPort) || null;
        }
        if (!preferred) {
            debugLog('sensor serial candidate not found (usbmodem/usbserial/arduino)');
            return;
        }

        sensorSerialPort = new SerialPort({
            path: preferred.path,
            baudRate: SENSOR_SERIAL_BAUD_RATE,
            autoOpen: true
        });
        debugLog(`serial open requested: ${preferred.path} @ ${SENSOR_SERIAL_BAUD_RATE}`);

        sensorSerialPort.on('open', () => {
            debugLog(`serial opened: ${preferred.path}`);
        });

        sensorSerialPort.on('error', (error) => {
            debugLog(`serial error: ${error?.message || error}`);
        });

        sensorSerialPort.on('data', (chunk) => {
            sensorSerialBuffer += chunk.toString('utf8');
            let newlineIndex = sensorSerialBuffer.indexOf('\n');
            while (newlineIndex >= 0) {
                const line = sensorSerialBuffer.slice(0, newlineIndex);
                sensorSerialBuffer = sensorSerialBuffer.slice(newlineIndex + 1);
                handleSensorSerialLine(line);
                newlineIndex = sensorSerialBuffer.indexOf('\n');
            }
        });
    } catch (error) {
        debugLog(`serial init failed: ${error?.message || error}`);
    }
}

function initializeStableVideos() {
    const template = getTemplateVideo();
    if (template) {
        template.dataset.pooled = 'true';
        template.muted = true;
        template.preload = 'auto';
        template.playsInline = true;
        template.loop = false;
        videoPool.set(0, template);
        const fileUrl = resolveVideoFileUrl();
        if (fileUrl) {
            template.src = fileUrl;
        }
        debugLog(`template ready src=${template.src || 'n/a'}`);
        try {
            template.load();
        } catch (e) {
            // ignore
        }
    } else {
        debugLog('template video not found');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const container = document.querySelector('.container');
    if (container) {
        container.style.height = `${ROW_HEIGHT_PX * DISPLAY_ROW_COUNT}px`;
    }
    buildPriceTags();
    initializeStableVideos();
    initializeSensorSerial();

    window.addEventListener('resize', () => {
        recalculateStableVideoPlacements();
    });

    window.addEventListener('keydown', (e) => {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
            return;
        }
        if (e.repeat) {
            return;
        }
        const rowNumber = parseInt(e.key, 10);
        if (rowNumber >= 1 && rowNumber <= DISPLAY_ROW_COUNT) {
            debugLog(`key ${e.key} -> row ${rowNumber}`);
            playStableVideoForRow(rowNumber - 1, {
                allowToggleOff: true,
                forceRestart: false
            });
        } else {
            debugLog(`key ${e.key} ignored`);
        }
    });
});
