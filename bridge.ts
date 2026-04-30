// Injected into web-tools domains to pass the extension's data into the window context
import { beamLog } from './logger';

/**
 * MESSAGING BRIDGE
 * Relays data between the Extension (Chrome Runtime/Storage) 
 * and the Web App (Window postMessage).
 */

// Listen for messages from the web app
window.addEventListener('message', (event) => {
    // Only accept from same window
    if (event.source !== window) return;

    if (event.data.type === 'WEB_TOOLS_APP_READY' || event.data.type === 'WEB_TOOLS_REQUEST_SYNC') {
        syncAllDataToApp();
    }

    if (event.data.type === 'WEB_TOOLS_HEARTBEAT_REQUEST' || event.data.type === 'WEB_TOOLS_APP_READY') {
        sendHeartbeatResponse();
    }
});

// Listen for push updates from the background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'HEARTBEAT_UPDATE') {
        window.postMessage({
            type: 'WEB_TOOLS_HEARTBEAT_RESPONSE',
            payload: message.payload
        }, '*');
    }

    if (message.type === 'SYNC_DATA') {
        // Step 1: Execute PROBE to see if the web app is awake and has network-bridge.js
        window.postMessage({ type: 'WEB_TOOLS_PROBE' }, '*');
        
        // Step 2: Set up a one-time listener for the PROBE_ACK
        const ackListener = (event: MessageEvent) => {
            if (event.source !== window || event.data.type !== 'WEB_TOOLS_PROBE_ACK') return;
            
            // Web app is awake! Proceed with payload delivery
            window.removeEventListener('message', ackListener);
            if (probeTimeout) clearTimeout(probeTimeout);

            if (message.payload) {
                // Hand-delivery
                window.postMessage({
                    type: 'WEB_TOOLS_EXTENSION_SYNC',
                    dataType: message.dataType || 'SAF', 
                    payload: message.payload
                }, '*');
                beamLog(`Direct ${message.dataType || 'SAF'} sync delivered`, 'success');
            } else {
                syncAllDataToApp();
            }
            sendResponse({ success: true });
        };

        window.addEventListener('message', ackListener);

        // Step 3: Wait. If no ACK after 500ms, the tab is likely throttled/asleep.
        // Return false so popup.ts / background.ts knows to trigger a full tab reload.
        const probeTimeout = setTimeout(() => {
            window.removeEventListener('message', ackListener);
            console.log('[Bridge] PROBE timeout. Tab might be asleep.');
            sendResponse({ success: false, reason: 'timeout' });
        }, 500);

        return true; // Keep message channel open for async sendResponse
    }
    return false;
});

// Initialize on load
syncAllDataToApp();
sendHeartbeatResponse();

function sendHeartbeatResponse() {
    chrome.runtime.sendMessage({ type: 'GET_HEARTBEAT_DATA' }, (response) => {
        if (chrome.runtime.lastError || !response) return;
        window.postMessage({
            type: 'WEB_TOOLS_HEARTBEAT_RESPONSE',
            payload: response
        }, '*');
    });
}

/** 
 * Synchronizes Schedule, Extracted SAF, and Curriculum data if available.
 */
function syncAllDataToApp() {
    chrome.storage.local.get(['latestSchedule', 'extractedSchedule', 'latestCurriculum'], (result) => {
        // 1. Auto-Sync Schedule (Persistent)
        if (result.latestSchedule) {
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                dataType: 'SAF',
                payload: result.latestSchedule
            }, '*');
            beamLog("Persistent Schedule payload pushed", 'success');
        }

        // 2. Manually Extracted SAF (Ephemeral)
        if (result.extractedSchedule) {
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                dataType: 'SAF_EXTRACT',
                payload: result.extractedSchedule
            }, '*');
            beamLog("Extracted SAF payload pushed", 'success');
        }

        // 3. Curriculum Data (Ephemeral)
        if (result.latestCurriculum) {
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                dataType: 'CURRICULUM',
                payload: result.latestCurriculum
            }, '*');
            beamLog("Curriculum payload pushed", 'success');
        }
    });
}

// Listen for live updates in real time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;

    // Auto-Sync Update
    if (changes.latestSchedule) {
        window.postMessage({
            type: 'WEB_TOOLS_EXTENSION_SYNC',
            dataType: 'SAF',
            payload: changes.latestSchedule.newValue
        }, '*');
        beamLog("Real-time Schedule update pushed", 'success');
    }

    // Manual Extract Update
    if (changes.extractedSchedule) {
        window.postMessage({
            type: 'WEB_TOOLS_EXTENSION_SYNC',
            dataType: 'SAF_EXTRACT',
            payload: changes.extractedSchedule.newValue
        }, '*');
        beamLog("Real-time Manual SAF update pushed", 'success');
    }

    // Curriculum Update
    if (changes.latestCurriculum) {
        window.postMessage({
            type: 'WEB_TOOLS_EXTENSION_SYNC',
            dataType: 'CURRICULUM',
            payload: changes.latestCurriculum.newValue
        }, '*');
        beamLog("Real-time Curriculum update pushed", 'success');
    }
});

/**
 * EPHEMERAL CLEANUP (The Handshake ACK)
 * Listens for an acknowledgment from the Web App to clear ephemeral storage keys.
 */
window.addEventListener('message', (event) => {
    if (event.source !== window) return;

    if (event.data.type === 'WEB_TOOLS_SYNC_ACK') {
        const { dataType } = event.data;
        
        if (dataType === 'CURRICULUM') {
            chrome.storage.local.remove(['latestCurriculum']);
            beamLog("Curriculum ephemeral storage cleared", 'info');
        } else if (dataType === 'SAF_EXTRACT') {
            chrome.storage.local.remove(['extractedSchedule']);
            beamLog("Extracted SAF ephemeral storage cleared", 'info');
        } else if (dataType === 'SAF') {
            // Smart Cleanup: If Auto-Sync is disabled, clear the persistent key too
            chrome.storage.local.get(['autoSchedEnabled'], (result) => {
                if (!result.autoSchedEnabled) {
                    chrome.storage.local.remove(['latestSchedule']);
                    beamLog("Schedule data cleared because Auto-Sync is disabled", 'info');
                }
            });
        }
    }
});
