// Background service worker.

const PORTAL_URLS = [
    "*://solar.feutech.edu.ph/*",
    "*://oses.feutech.edu.ph/*",
    "*://solar.feualabang.edu.ph/*",
    "*://oses.feualabang.edu.ph/*",
    "*://solar.feudiliman.edu.ph/*",
    "*://oses.feudiliman.edu.ph/*",
    "*://localhost/*"
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_HEARTBEAT_DATA') {
        chrome.tabs.query({ url: PORTAL_URLS }, (tabs) => {
            const isPortalOpen = tabs && tabs.length > 0;
            chrome.storage.local.get(['autoSchedEnabled'], (result) => {
                const autoSchedEnabled = !!result.autoSchedEnabled;
                sendResponse({ installed: true, autoSchedEnabled, isPortalOpen });
            });
        });
        return true;
    }

    if (request.action === 'BEAM_LOG' && request.payload) {
        // 1. Persist logs for the Activity Log
        chrome.storage.local.get(['appLogs'], (result) => {
            const logs = result.appLogs || [];
            const newLog = {
                ...request.payload,
                timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
            };
            const updatedLogs = [newLog, ...logs].slice(0, 50);
            chrome.storage.local.set({ appLogs: updatedLogs });
        });

        // 2. Relay log to the Companion Hub if the sender is a portal tab
        if (sender.tab && sender.tab.id) {
            chrome.tabs.sendMessage(sender.tab.id, {
                action: 'SHOW_LOG',
                message: request.payload.message,
                logType: request.payload.level
            }).catch(() => {});
        }
    }
});

/* Broadcast status to web tools. */
function broadcastStatus() {
    chrome.tabs.query({ url: PORTAL_URLS }, (portalTabs) => {
        const isPortalOpen = portalTabs && portalTabs.length > 0;
        
        chrome.storage.local.get(['autoSchedEnabled'], (result) => {
            const autoSchedEnabled = !!result.autoSchedEnabled;
            const payload = {
                installed: true,
                autoSchedEnabled: autoSchedEnabled,
                isPortalOpen: isPortalOpen
            };
            
            // Find all Web Tool tabs and notify them
            chrome.tabs.query({
                url: [
                    "*://localhost/*",
                    "*://tools.kendavila.me/*",
                    "*://web-tools-teal.vercel.app/*"
                ]
            }, (webToolTabs) => {
                webToolTabs.forEach(tab => {
                    if (tab.id) {
                        chrome.tabs.sendMessage(tab.id, {
                            type: 'HEARTBEAT_UPDATE',
                            payload: payload
                        }).catch(() => { /* Ignore tabs that aren't ready */ });
                    }
                });
            });
        });
    });
}

/* Lifecycle observers. */
chrome.tabs.onUpdated.addListener(broadcastStatus);
chrome.tabs.onRemoved.addListener(broadcastStatus);

/* Setting observers. */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoSchedEnabled) {
        broadcastStatus();
    }
});
