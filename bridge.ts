/*
  Web Tools Companion
  Copyright (C) 2026 Kenneth Westhle A. Davila

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

// Injected into web-tools domains to pass the extension's data into the window context
import { beamLog } from './logger';

/**
 * MESSAGING BRIDGE
 * Relays data between the Extension (Chrome Runtime/Storage) 
 * and the Web App (Window postMessage).
 */

// Generate a session nonce for the PROBE/ACK handshake
const BRIDGE_SESSION_NONCE = crypto.randomUUID();
const MessageType = {
    // Incoming
    APP_READY: 'WEB_TOOLS_APP_READY',
    REQUEST_SYNC: 'WEB_TOOLS_REQUEST_SYNC',
    HEARTBEAT_REQUEST: 'WEB_TOOLS_HEARTBEAT_REQUEST',
    PROBE_ACK: 'WEB_TOOLS_PROBE_ACK',
    SYNC_ACK: 'WEB_TOOLS_SYNC_ACK',
    
    // Outgoing
    PROBE: 'WEB_TOOLS_PROBE',
    EXTENSION_SYNC: 'WEB_TOOLS_EXTENSION_SYNC',
    HEARTBEAT_RESPONSE: 'WEB_TOOLS_HEARTBEAT_RESPONSE',
    
    // Internal
    HEARTBEAT_UPDATE: 'HEARTBEAT_UPDATE',
    SYNC_DATA: 'SYNC_DATA'
} as const;

// Whitelist of allowed message types from the web app
const ALLOWED_APP_MESSAGE_TYPES = new Set<string>([
    MessageType.APP_READY,
    MessageType.REQUEST_SYNC,
    MessageType.HEARTBEAT_REQUEST,
    MessageType.PROBE_ACK,
    MessageType.SYNC_ACK
]);

// Whitelist of allowed sync data types
const ALLOWED_DATA_TYPES = new Set(['SAF', 'SAF_EXTRACT', 'CURRICULUM']);

const DEBUG_MODE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

// Helper to validate incoming message shape
function isValidMessage(data: any): boolean {
    const isValid = !!(
        data && 
        typeof data === 'object' && 
        typeof data.type === 'string' && 
        ALLOWED_APP_MESSAGE_TYPES.has(data.type)
    );

    if (!isValid && DEBUG_MODE) {
        console.warn("[Bridge] Received malformed or unauthorized message:", data);
    }

    return isValid;
}

/**
 * CENTRALIZED MESSAGE HANDLER
 * Validates and dispatches messages from the Web App.
 */
function handleAppMessage(data: any) {
    switch (data.type) {
        case MessageType.APP_READY:
        case MessageType.REQUEST_SYNC:
            syncAllDataToApp();
            sendHeartbeatResponse();
            return;
        
        case MessageType.HEARTBEAT_REQUEST:
            sendHeartbeatResponse();
            return;

        case MessageType.SYNC_ACK:
            handleSyncAck(data);
            return;

        default:
            return;
    }
}

/**
 * EPHEMERAL CLEANUP (The Handshake ACK)
 * Clears ephemeral storage keys after the app acknowledges receipt.
 */
function handleSyncAck(data: any) {
    const { dataType } = data;
    if (typeof dataType !== 'string' || !ALLOWED_DATA_TYPES.has(dataType)) {
        if (DEBUG_MODE) console.warn("[Bridge] Invalid dataType in SYNC_ACK:", dataType);
        return;
    }

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

// Listen for messages from the web app
window.addEventListener('message', (event) => {
    // Only accept from same window and check basic shape/type
    if (event.source !== window || !isValidMessage(event.data)) return;

    handleAppMessage(event.data);
});

// Listen for push updates from the background script or popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === MessageType.HEARTBEAT_UPDATE) {
        window.postMessage({
            type: MessageType.HEARTBEAT_RESPONSE,
            payload: message.payload
        }, window.location.origin);
        return false;
    }

    if (message.type === MessageType.SYNC_DATA) {
        const isSilent = message.dataType !== 'SAF_EXTRACT';

        if (isSilent) {
            // Skip the PROBE and the payload wait for silent syncs
            if (message.payload) {
                window.postMessage({
                    type: MessageType.EXTENSION_SYNC,
                    dataType: message.dataType || 'SAF', 
                    payload: message.payload,
                    isSilent: true
                }, window.location.origin);
                beamLog(`Direct ${message.dataType || 'SAF'} silent sync delivered`, 'success');
            } else {
                syncAllDataToApp();
            }
            sendResponse({ success: true });
            return false; // Synchronous response
        }

        // Step 1: Execute PROBE with a secure nonce
        window.postMessage({ 
            type: MessageType.PROBE,
            nonce: BRIDGE_SESSION_NONCE
        }, window.location.origin);
        
        // Step 2: Set up a one-time listener for the PROBE_ACK
        const ackListener = (event: MessageEvent) => {
            const isTargetAck = (
                event.source === window && 
                isValidMessage(event.data) && 
                event.data.type === MessageType.PROBE_ACK &&
                event.data.nonce === BRIDGE_SESSION_NONCE
            );

            if (!isTargetAck) return;
            
            // Web app is awake! Proceed with payload delivery
            window.removeEventListener('message', ackListener);
            if (probeTimeout) clearTimeout(probeTimeout);

            if (message.payload) {
                // Hand-delivery
                window.postMessage({
                    type: MessageType.EXTENSION_SYNC,
                    dataType: message.dataType || 'SAF', 
                    payload: message.payload
                }, window.location.origin);
                beamLog(`Direct ${message.dataType || 'SAF'} sync delivered`, 'success');
            } else {
                syncAllDataToApp();
            }
            sendResponse({ success: true });
        };

        window.addEventListener('message', ackListener);

        // Step 3: Wait. If no ACK after 2000ms, the tab is likely throttled/asleep.
        // Return false so popup.ts / background.ts knows to trigger a full tab reload.
        const probeTimeout = setTimeout(() => {
            window.removeEventListener('message', ackListener);
            console.log('[Bridge] PROBE timeout. Tab might be asleep.');
            sendResponse({ success: false, reason: 'timeout' });
        }, 2000);

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
            type: MessageType.HEARTBEAT_RESPONSE,
            payload: response
        }, window.location.origin);
    });
}

let lastSyncTime = 0;
const SYNC_COOLDOWN_MS = 500;

/** 
 * Synchronizes Schedule, Extracted SAF, and Curriculum data if available.
 */
function syncAllDataToApp() {
    const now = Date.now();
    if (now - lastSyncTime < SYNC_COOLDOWN_MS) {
        if (DEBUG_MODE) console.log("[Bridge] Sync request throttled (cooldown)");
        return;
    }
    lastSyncTime = now;

    chrome.storage.local.get(['latestSchedule', 'extractedSchedule', 'latestCurriculum'], (result) => {
        // 1. Auto-Sync Schedule (Persistent)
        if (result.latestSchedule) {
            window.postMessage({
                type: MessageType.EXTENSION_SYNC,
                dataType: 'SAF',
                payload: result.latestSchedule,
                isSilent: true
            }, window.location.origin);
            beamLog("Persistent Schedule payload pushed", 'success');
        }

        // 2. Manually Extracted SAF (Ephemeral)
        if (result.extractedSchedule) {
            window.postMessage({
                type: MessageType.EXTENSION_SYNC,
                dataType: 'SAF_EXTRACT',
                payload: result.extractedSchedule
            }, window.location.origin);
            beamLog("Extracted SAF payload pushed", 'success');
        }

        // 3. Curriculum Data (Ephemeral)
        if (result.latestCurriculum) {
            window.postMessage({
                type: MessageType.EXTENSION_SYNC,
                dataType: 'CURRICULUM',
                payload: result.latestCurriculum,
                isSilent: true
            }, window.location.origin);
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
            type: MessageType.EXTENSION_SYNC,
            dataType: 'SAF',
            payload: changes.latestSchedule.newValue,
            isSilent: true
        }, window.location.origin);
        beamLog("Real-time Schedule update pushed", 'success');
    }

    // Manual Extract Update
    if (changes.extractedSchedule) {
        window.postMessage({
            type: MessageType.EXTENSION_SYNC,
            dataType: 'SAF_EXTRACT',
            payload: changes.extractedSchedule.newValue
        }, window.location.origin);
        beamLog("Real-time Manual SAF update pushed", 'success');
    }

    // Curriculum Update
    if (changes.latestCurriculum) {
        window.postMessage({
            type: MessageType.EXTENSION_SYNC,
            dataType: 'CURRICULUM',
            payload: changes.latestCurriculum.newValue,
            isSilent: true
        }, window.location.origin);
        beamLog("Real-time Curriculum update pushed", 'success');
    }
});

