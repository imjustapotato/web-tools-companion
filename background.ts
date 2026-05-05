/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */

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

let isProcessingLogQueue = false;
let logQueue: {message: string, level: string, timestamp: string}[] = [];

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
        // 1. Enqueue and process sequentially to prevent race condition data loss
        const newLog = {
            ...request.payload,
            timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };
        
        logQueue.push(newLog);
        processLogQueue();

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

function processLogQueue() {
    if (isProcessingLogQueue || logQueue.length === 0) return;
    isProcessingLogQueue = true;

    chrome.storage.local.get(['appLogs'], (result) => {
        const logs = result.appLogs || [];
        // Extract all current items in queue
        const newLogsToProcess = [...logQueue];
        logQueue = []; 
        
        // Reverse array so latest comes first when prepending
        const updatedLogs = [...newLogsToProcess.reverse(), ...logs].slice(0, 50);
        
        chrome.storage.local.set({ appLogs: updatedLogs }, () => {
            isProcessingLogQueue = false;
            // Process any items added while we were saving
            if (logQueue.length > 0) {
                processLogQueue();
            }
        });
    });
}

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

/* Bulletproof Auto-Sync Handoff with Probe */
function pushAutoSyncToWebTools(scheduleData: any) {
    chrome.tabs.query({
        url: [
            "*://localhost/*",
            "*://tools.kendavila.me/*",
            "*://web-tools-teal.vercel.app/*"
        ]
    }, (webToolTabs) => {
        const targetPath = 'schedule-visualizer';
        const targetTabs = webToolTabs.filter(t => t.url?.includes(targetPath));

        targetTabs.forEach(tab => {
            if (tab.id) {
                // Attempt probe message first
                chrome.tabs.sendMessage(tab.id, {
                    type: 'SYNC_DATA',
                    dataType: 'SAF',
                    payload: scheduleData
                }, (response) => {
                    // Fail-safe: Port closed (suspended) OR Probe timeout
                    if (chrome.runtime.lastError || !response || !response.success) {
                        // Silent background reload to wake it up.
                        // bridge.ts will pull the data automatically on load.
                        chrome.tabs.reload(tab.id!);
                    }
                });
            }
        });
    });
}

/* Lifecycle observers. */
chrome.tabs.onUpdated.addListener(broadcastStatus);
chrome.tabs.onRemoved.addListener(broadcastStatus);

/* Setting observers. */
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== 'local') return;
    
    if (changes.autoSchedEnabled) {
        broadcastStatus();
    }

    if (changes.latestSchedule) {
        pushAutoSyncToWebTools(changes.latestSchedule.newValue);
    }
});