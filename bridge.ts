// Injected into web-tools domains to pass the extension's data into the window context

// Listen for messages from the web app (in case it explicitly requests data)
window.addEventListener('message', (event) => {
    // Only accept from same window
    if (event.source !== window) return;

    if (event.data.type === 'WEB_TOOLS_APP_READY' || event.data.type === 'WEB_TOOLS_REQUEST_SYNC') {
        syncScheduleToApp();
    }
});

// Also try to push automatically on load
syncScheduleToApp();

function syncScheduleToApp() {
    chrome.storage.local.get(['latestSchedule', 'autoSchedEnabled'], (result) => {
        if (result.latestSchedule && result.autoSchedEnabled) {
            window.postMessage({
                type: 'WEB_TOOLS_EXTENSION_SYNC',
                payload: result.latestSchedule
            }, '*');
            console.log("[Web Tools Bridge] Schedule payload pushed to web app.");
        }
    });
}

// Listen for live updates from the interceptor in real time
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.latestSchedule) {
        chrome.storage.local.get(['autoSchedEnabled'], (result) => {
            if (result.autoSchedEnabled) {
                window.postMessage({
                    type: 'WEB_TOOLS_EXTENSION_SYNC',
                    payload: changes.latestSchedule.newValue
                }, '*');
                console.log("[Web Tools Bridge] Real-time schedule update pushed to web app.");
            }
        });
    }
});
