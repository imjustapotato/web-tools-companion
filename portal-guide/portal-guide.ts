/**
 * Portal Guide Orchestrator
 * Manages the Companion Hub and future guide logic on the SOLAR Portal.
 */
import { CompanionHub, HubConfig } from './status-dom';
import { LoggerHub } from './logger-dom';
import { PortalGuide } from './guide-dom';

// Global Hub Instance
let hubHost: HTMLDivElement | null = null;
let hubUI: CompanionHub | null = null;
let logger: LoggerHub | null = null;
let guide: PortalGuide | null = null;

// Default Configuration
let currentConfig: HubConfig = {
    position: 'bottom-left',
    showParticle: true,
    showHub: true
};

function initializeHub() {
    if (hubUI) return;
    
    try {
        if (!document.body) return;

        hubHost = document.createElement('div');
        hubHost.id = 'web-tools-companion-hub-host';
        document.body.appendChild(hubHost);

        hubUI = new CompanionHub(hubHost, currentConfig);
        
        const shadowContainer = hubUI.shadowRoot.getElementById('companion-hub-container');
        logger = new LoggerHub(shadowContainer || hubUI.shadowRoot);
        guide = new PortalGuide();
        
        applyHubVisibility();

        // Hydrate state from storage
        chrome.storage.local.get(['autoSchedEnabled', 'hubConfig'], (result) => {
            if (result.hubConfig) {
                currentConfig = { ...currentConfig, ...result.hubConfig };
                hubUI?.updateConfig(currentConfig);
                applyHubVisibility();
            }

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

function applyHubVisibility() {
    if (!hubHost) return;
    
    // Completely hide the container if the user opted out
    if (!currentConfig.showHub) {
        hubHost.style.display = 'none';
    } else {
        hubHost.style.display = 'block';
    }
}

// Message Relay
chrome.runtime.onMessage.addListener((request) => {
    if (!hubUI) initializeHub();
    if (!hubUI) return;

    try {
        if (request.action === 'UPDATE_HUB_STATUS') {
            hubUI.update(request.title, request.subtitle, request.state);
        }
        
        if (request.action === 'SHOW_BEAMING') {
            hubUI.showBeaming();
        }

        if (request.action === 'FIRE_PAYLOAD_BEAM') {
            hubUI.triggerPayloadBeam(request.payloadType, request.icon);
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
});

// Local Event Relay
window.addEventListener('WEB_TOOLS_HUB_ACTION', (event: any) => {
    if (event.detail) handleHubAction(event.detail);
});

// Persistence & Settings Listener
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !hubUI) return;

    if (changes.hubConfig) {
        currentConfig = { ...currentConfig, ...changes.hubConfig.newValue };
        hubUI.updateConfig(currentConfig);
        applyHubVisibility();
    }

    if (changes.autoSchedEnabled) {
        const active = changes.autoSchedEnabled.newValue;
        if (active) hubUI.update("Auto-Sync Active", "Monitoring Portal...", 'active');
        else hubUI.update("Auto-Sync Inactive", "Enable in settings to begin.", 'idle');
    }
});

function handleHubAction(request: any) {
    if (!hubUI) initializeHub();
    if (!hubUI) return;

    if (request.action === 'UPDATE_HUB_STATUS') {
        hubUI.update(request.title, request.subtitle, request.state);
    }
    
    if (request.action === 'SHOW_BEAMING') {
        hubUI.showBeaming();
    }

    if (request.action === 'FIRE_PAYLOAD_BEAM') {
        hubUI.triggerPayloadBeam(request.payloadType, request.icon);
    }

    if (request.action === 'SHOW_LOG' && logger) {
        logger.log(request.message, request.logType);
    }

    if (request.action === 'HIGHLIGHT_ELEMENT' && guide) {
        guide.highlightElement(request.selector, request.message);
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeHub();
} else {
    window.addEventListener('load', initializeHub);
}