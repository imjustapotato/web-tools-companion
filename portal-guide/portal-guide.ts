/**
 * Portal Guide Orchestrator
 * Manages the Companion Hub and future guide logic on the SOLAR Portal.
 */
import { CompanionHub } from './status-dom';
import { LoggerHub } from './logger-dom';
import { PortalGuide } from './guide-dom';

// Global Hub Instance
let hubHost: HTMLDivElement | null = null;
let hubUI: CompanionHub | null = null;
let logger: LoggerHub | null = null;
let guide: PortalGuide | null = null;

function initializeHub() {
    if (hubUI) return;
    
    try {
        if (!document.body) {
            console.warn("[Web Tools] document.body not found. Hub injection delayed.");
            return;
        }

        // 1. Create host
        hubHost = document.createElement('div');
        hubHost.id = 'web-tools-companion-hub-host';
        document.body.appendChild(hubHost);

        // 2. Initialize UI
        hubUI = new CompanionHub(hubHost);
        
        // 3. Initialize Logger and Guide
        const shadowContainer = hubUI.shadowRoot.getElementById('companion-hub-container');
        logger = new LoggerHub(shadowContainer || hubUI.shadowRoot);
        guide = new PortalGuide();
        
        // 4. Set initial state based on storage
        chrome.storage.local.get(['autoSchedEnabled'], (result) => {
            if (result.autoSchedEnabled) {
                hubUI?.update("Auto-Sync Active", "Monitoring Portal...", 'active');
            } else {
                hubUI?.update("Auto-Sync Inactive", "Enable in settings to begin.", 'idle');
            }
        });

        console.log("[Web Tools] Portal Companion Trinity Initialized.");
    } catch (e) {
        console.error("[Web Tools] Critical Hub initialization error:", e);
    }
}

// Storage Listener for Mode Persistence
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.autoSchedEnabled && hubUI) {
        const active = changes.autoSchedEnabled.newValue;
        if (active) {
            hubUI.update("Auto-Sync Active", "Monitoring Portal...", 'active');
        } else {
            hubUI.update("Auto-Sync Inactive", "Enable in settings to begin.", 'idle');
        }
    }
});

// Message Relay (External from Background/Popup)
chrome.runtime.onMessage.addListener((request) => {
    handleHubAction(request);
});

// Local Event Relay (From other content scripts like autosched.ts)
window.addEventListener('WEB_TOOLS_HUB_ACTION', (event: any) => {
    if (event.detail) {
        handleHubAction(event.detail);
    }
});

function handleHubAction(request: any) {
    if (!hubUI) initializeHub();
    if (!hubUI) return;

    try {
        if (request.action === 'UPDATE_HUB_STATUS') {
            hubUI.update(request.title, request.subtitle, request.state);
        }
        
        if (request.action === 'SHOW_BEAMING') {
            hubUI.showBeaming();
        }

        if (request.action === 'SHOW_LOG' && logger) {
            logger.log(request.message, request.logType);
        }

        if (request.action === 'HIGHLIGHT_ELEMENT' && guide) {
            guide.highlightElement(request.selector, request.message);
        }

        if (request.action === 'CLEAR_GUIDE' && guide) {
            guide.clearHighlights();
        }
    } catch (e) {
        console.error("[Web Tools] Error handling message in Portal Hub:", e);
    }
}

// Auto-init on load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeHub();
} else {
    window.addEventListener('load', initializeHub);
}
