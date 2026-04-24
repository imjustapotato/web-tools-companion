// Background service worker.

const PORTAL_URLS = [
    '*://oses.feutech.edu.ph/*',
    '*://solar.feutech.edu.ph/*',
    '*://oses.feualabang.edu.ph/*',
    '*://solar.feualabang.edu.ph/*',
    '*://oses.feudiliman.edu.ph/*',
    '*://solar.feudiliman.edu.ph/*'
];

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'GET_HEARTBEAT_DATA') {
        // Step 1: Check if any Portal tab is open
        chrome.tabs.query({ url: PORTAL_URLS }, (tabs) => {
            const isPortalOpen = tabs && tabs.length > 0;
            
            // Step 2: Check autoSchedEnabled from storage
            chrome.storage.local.get(['autoSchedEnabled'], (result) => {
                const autoSchedEnabled = !!result.autoSchedEnabled;
                
                // Step 3: Send the combined status back to the content script
                sendResponse({
                    installed: true,
                    autoSchedEnabled: autoSchedEnabled,
                    isPortalOpen: isPortalOpen
                });
            });
        });
        
        // Return true to indicate we will send the response asynchronously
        return true;
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
