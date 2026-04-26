// Injected into web-tools domains to pass the extension's data into the window context
import { beamLog } from './logger';

// Listen for messages from the web app (in case it explicitly requests data)
window.addEventListener('message', (event) => {
    // Only accept from same window
    if (event.source !== window) return;

    if (event.data.type === 'WEB_TOOLS_APP_READY' || event.data.type === 'WEB_TOOLS_REQUEST_SYNC') {
        syncScheduleToApp();
    }

    if (event.data.type === 'WEB_TOOLS_HEARTBEAT_REQUEST' || event.data.type === 'WEB_TOOLS_APP_READY') {
        sendHeartbeatResponse();
    }
});

// Listen for push updates from the background script
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'HEARTBEAT_UPDATE') {
        window.postMessage({
            type: 'WEB_TOOLS_HEARTBEAT_RESPONSE',
            payload: message.payload
        }, '*');
    }

    if (message.type === 'SYNC_DATA') {
        if (message.payload) {
            // Hand-delivery: Push directly to app without waiting for storage
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                payload: message.payload
            }, '*');
            beamLog("Direct data sync delivered to Visualizer", 'success');
        } else {
            syncScheduleToApp();
        }
    }
});

// Also try to push automatically on load
syncScheduleToApp();
sendHeartbeatResponse();

function sendHeartbeatResponse() {
    chrome.runtime.sendMessage({ type: 'GET_HEARTBEAT_DATA' }, (response) => {
        if (chrome.runtime.lastError) {
            // Background might not be ready yet, ignore silently or log
            return;
        }
        if (response) {
            window.postMessage({
                type: 'WEB_TOOLS_HEARTBEAT_RESPONSE',
                payload: response
            }, '*');
        }
    });
}

function syncScheduleToApp() {
    chrome.storage.local.get(['latestSchedule'], (result) => {
        if (result.latestSchedule) {
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                payload: result.latestSchedule
            }, '*');
            beamLog("Schedule payload pushed to Visualizer", 'success');
        }
    });
}

// Listen for live updates from the interceptor in real time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.latestSchedule) {
        window.postMessage({
            type: 'WEB_TOOLS_EXTENSION_SYNC',
            payload: changes.latestSchedule.newValue
        }, '*');
        beamLog("Real-time update pushed to Visualizer", 'success');
    }
});
