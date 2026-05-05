/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */
import 'iconify-icon';
import { setSafeHTML, clearElement } from './src/utils/dom';
import { AnimEngine } from './animation-engine';
import { beamLog } from './logger';
import { gsap } from 'gsap';

/* CONFIGURATION */
const APP_URLS = {
    VISUALIZER: 'https://tools.kendavila.me/',
    REGISTRATION: 'https://solar.feutech.edu.ph/course/registration'
};

const DOMAINS = {
    PORTALS: ['localhost:8000', 'feutech.edu.ph', 'feualabang.edu.ph', 'feudiliman.edu.ph'],
    TOOLS: ['localhost:5173', 'tools.kendavila.me', 'web-tools-teal.vercel.app']
};

/* TAB MANAGEMENT */
const initNavigation = () => {
    const btnOpenTools = document.getElementById('btn-open-tools') as HTMLButtonElement;
    
    btnOpenTools.addEventListener('click', () => {
        AnimEngine.animatePressFeedback(btnOpenTools);
        chrome.tabs.create({ url: APP_URLS.VISUALIZER });
    });
};

/** 
 * Ensures the workspace is set up by opening required portal and tool tabs.
 */
const ensureRequiredTabsAreOpen = () => {
    chrome.tabs.query({}, (tabs) => {
        const isOpen = (domainList: string[]) => tabs.some(tab => domainList.some(d => tab.url?.includes(d)));
        
        const isPortalOpen = isOpen(DOMAINS.PORTALS);
        const isToolOpen = isOpen(DOMAINS.TOOLS);

        if (!isPortalOpen) chrome.tabs.create({ url: APP_URLS.REGISTRATION });
        if (!isToolOpen) chrome.tabs.create({ url: `${APP_URLS.VISUALIZER}schedule-visualizer/` });
    });
};

/* UI COMPONENTS: MODALS */
interface ModalOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'confirm' | 'alert';
    severity?: 'info' | 'warning' | 'error';
}

/**
 * Orchestrates a GSAP-animated, promise-based confirmation or alert modal.
 * This replaces native browser dialogs to maintain UI immersion.
 */
const showModal = (options: ModalOptions): Promise<boolean> => {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal') as HTMLElement;
        const titleEl = document.getElementById('modal-title') as HTMLElement;
        const messageEl = document.getElementById('modal-message') as HTMLElement;
        const iconEl = document.getElementById('modal-icon') as HTMLElement;
        const btnConfirm = document.getElementById('modal-confirm') as HTMLButtonElement;
        const btnCancel = document.getElementById('modal-cancel') as HTMLButtonElement;
        const modalActions = document.getElementById('modal-actions') as HTMLElement;

        if (!modal || !btnConfirm || !btnCancel) return resolve(false);

        // Setup Content
        titleEl.textContent = options.title;
        messageEl.textContent = options.message;
        btnConfirm.textContent = options.confirmText || (options.type === 'alert' ? 'Understood' : 'Confirm');
        btnCancel.textContent = options.cancelText || 'Cancel';
        
        // Setup Severity Visuals
        const iconMap = { info: 'lucide:info', warning: 'lucide:alert-triangle', error: 'lucide:x-circle' };
        const colorMap = { info: 'var(--accent-primary)', warning: '#f59e0b', error: '#ef4444' };
        const sev = options.severity || (options.type === 'alert' ? 'error' : 'warning');
        
        iconEl.setAttribute('icon', iconMap[sev as keyof typeof iconMap]);
        iconEl.style.color = colorMap[sev as keyof typeof colorMap];

        // Setup Layout (Alert vs Confirm)
        if (options.type === 'alert') {
            btnCancel.style.display = 'none';
            modalActions.style.gridTemplateColumns = '1fr';
        } else {
            btnCancel.style.display = 'block';
            modalActions.style.gridTemplateColumns = '1fr 1fr';
        }

        const cleanup = (result: boolean) => {
            AnimEngine.animateModal(modal, false);
            btnConfirm.removeEventListener('click', onConfirm);
            btnCancel.removeEventListener('click', onCancel);
            resolve(result);
        };

        const onConfirm = () => cleanup(true);
        const onCancel = () => cleanup(false);

        btnConfirm.addEventListener('click', onConfirm);
        btnCancel.addEventListener('click', onCancel);

        AnimEngine.animateModal(modal, true);
    });
};

/* DATA MANAGEMENT */
const initDataManagement = () => {
    const btnResetData = document.getElementById('btn-reset-data') as HTMLButtonElement;
    
    const handleReset = async () => {
        const isConfirmed = await showModal({
            title: "Clear All Data?",
            message: "Your stored schedule will be cleared. The Web Tools view will be empty on the next refresh.",
            confirmText: "Clear All",
            type: "confirm",
            severity: "warning"
        });
        
        if (!isConfirmed) return;

        await chrome.storage.local.remove(['latestSchedule']);
        updateDataStatusVisibility();
        
        // Provide quick visual feedback on the main reset button if it exists
        const icon = btnResetData.querySelector('iconify-icon');
        if (icon) {
            icon.setAttribute('icon', 'lucide:check');
            setTimeout(() => icon.setAttribute('icon', 'lucide:refresh-ccw'), 1000);
        }
    };

    btnResetData.addEventListener('click', handleReset);
    
    // Inline clear button in the Smart Note
    const btnClearInline = document.getElementById('btn-clear-inline');
    btnClearInline?.addEventListener('click', handleReset);
};

    /** 
     * Updates visibility and content of the 'Smart Note' based on stored data.
     * Triggers accordion recalculation to ensure smooth layout shifts.
     */
    const updateDataStatusVisibility = () => {
        const dataStatusBadge = document.getElementById('data-status-badge') as HTMLElement;
        const tooltip = document.getElementById('mouse-tooltip') as HTMLElement;
        const tooltipContent = document.getElementById('tooltip-content') as HTMLElement;
        const clearWrap = document.getElementById('tooltip-clear-wrap') as HTMLElement;
        const btnAutoSched = document.getElementById('btn-auto-sched') as HTMLButtonElement;

    chrome.storage.local.get(['latestSchedule', 'autoSchedEnabled'], ({ latestSchedule, autoSchedEnabled }) => {
        const hasData = !!latestSchedule;
        const isSyncing = !!autoSchedEnabled;

        // 1. Update the 'Saved' badge pulse
        AnimEngine.animateStatusBadge(dataStatusBadge, hasData);

        // 2. Handle the 'Smart Note' content and visibility
        if (hasData) {
            tooltip.classList.add('force-visible');
            clearWrap.classList.remove('hidden');
            
            if (isSyncing) {
                tooltipContent.textContent = "Syncing live... Stored data will also auto-populate your view.";
            } else {
                tooltipContent.textContent = "Stored data will automatically populate your visualizer.";
            }
        } else {
            // Hide the clear wrap if no data
            clearWrap.classList.add('hidden');
            
            if (isSyncing) {
                tooltip.classList.remove('force-visible'); // CSS .is-listening will handle it
                tooltipContent.textContent = "Monitoring for schedule changes. Add or remove subjects to sync automatically!";
            } else {
                tooltip.classList.remove('force-visible');
                tooltipContent.textContent = "";
            }
        }
        
        // 3. Smoothly adjust the accordion height to accommodate content shifts
        const accordionContent = btnAutoSched?.closest('.tool-group-content') as HTMLElement;
        if (accordionContent) AnimEngine.recalculateHeight(accordionContent);
    });
};

/* AUTO-PLOTTING: LIVE SYNC */
const initAutoScheduleToggle = () => {
    const btnAutoSched = document.getElementById('btn-auto-sched') as HTMLButtonElement;
    const autoSchedIcon = document.getElementById('auto-sched-icon') as HTMLElement;
    
    let isFeatureEnabled = false;

    const renderAutoScheduleState = (isEnabled: boolean) => {
        const tooltip = document.getElementById('mouse-tooltip') as HTMLElement;
        
        if (isEnabled) {
            btnAutoSched.classList.add('is-listening');
            autoSchedIcon.setAttribute('icon', 'lucide:loader-2');
            autoSchedIcon.classList.add('animate-spin');
            autoSchedIcon.style.color = 'var(--accent-primary)';
        } else {
            btnAutoSched.classList.remove('is-listening');
            autoSchedIcon.setAttribute('icon', 'ic:baseline-auto-awesome');
            autoSchedIcon.classList.remove('animate-spin');
            autoSchedIcon.style.color = '';
        }

        // Delegate content and visibility logic to the smart visibility updater
        updateDataStatusVisibility();
    };

    // Initialization
    chrome.storage.local.get(['autoSchedEnabled'], (result) => {
        isFeatureEnabled = !!result.autoSchedEnabled;
        renderAutoScheduleState(isFeatureEnabled);
    });

    btnAutoSched.addEventListener('click', () => {
        AnimEngine.animatePressFeedback(btnAutoSched);
        isFeatureEnabled = !isFeatureEnabled;
        
        chrome.storage.local.set({ autoSchedEnabled: isFeatureEnabled }, () => {
            renderAutoScheduleState(isFeatureEnabled);
            
            if (isFeatureEnabled) {
                ensureRequiredTabsAreOpen();
            }
        });
    });
};

/* PORTAL SCRAPING ORCHESTRATION */

/** Wraps chrome.tabs.sendMessage in a Promise for cleaner async/await flows. */
const sendMessageToTab = (tabId: number, message: any): Promise<any> => {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            resolve(chrome.runtime.lastError ? null : response);
        });
    });
};

/** 
 * Injects the SAF scraper script into the portal tab.
 */
const injectSafScraperScript = (tabId: number): Promise<boolean> => {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['saf-scraper.js']
        }, () => resolve(!chrome.runtime.lastError));
    });
};

/** 
 * Injects the Curriculum scraper script into the portal tab.
 */
const injectCurriculumScraperScript = (tabId: number): Promise<boolean> => {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['curriculum-scraper.js']
        }, () => resolve(!chrome.runtime.lastError));
    });
};

/** 
 * Forces a synchronization event in the Web Tools tab.
 * Implements the Probe -> Handoff -> Reload sequence to battle Chrome Memory Saver natively.
 */
const forceSyncWebToolsTabs = (payload?: any, type: 'SAF' | 'SAF_EXTRACT' | 'CURRICULUM' = 'SAF') => {
    chrome.tabs.query({}, (tabs) => {
        const matchingTabs = tabs.filter(tab => DOMAINS.TOOLS.some(url => tab.url?.includes(url)));
        const isSaf = type === 'SAF' || type === 'SAF_EXTRACT';
        const targetPath = isSaf ? 'schedule-visualizer/' : 'portal-parser/';

        if (matchingTabs.length > 0) {
            let targetTab = matchingTabs.find(t => t.url?.includes(targetPath)) || matchingTabs[0];

            if (targetTab.id) {
                // If wrong tool, redirect first
                if (!targetTab.url?.includes(targetPath)) {
                    chrome.tabs.update(targetTab.id, { url: `${APP_URLS.VISUALIZER}${targetPath}`, active: true });
                } else {
                    // It's the right tool. Attempt PROBE via messaging
                    chrome.tabs.sendMessage(targetTab.id, { 
                        type: 'SYNC_DATA',
                        dataType: type,
                        payload: payload 
                    }, (response) => {
                        // If we get an error (port closed) or the probe timed out (success: false)
                        if (chrome.runtime.lastError || !response || !response.success) {
                            beamLog('Probe failed. Triggering tab wake-up reload...', 'warn');
                            chrome.tabs.reload(targetTab.id!);
                        }
                    });
                    
                    // Always make the tab active
                    chrome.tabs.update(targetTab.id, { active: true });
                }
                
                // Focus the window containing the tab
                if (targetTab.windowId) {
                    chrome.windows.update(targetTab.windowId, { focused: true });
                }
            }
        } else {
            // No tool tab open at all
            chrome.tabs.create({ url: `${APP_URLS.VISUALIZER}${targetPath}` });
        }
    });
};

const initSafExtraction = () => {
    const btnExtractSaf = document.getElementById('btn-extract-saf') as HTMLButtonElement;
    
    btnExtractSaf.addEventListener('click', async () => {
        AnimEngine.animatePressFeedback(btnExtractSaf);
        
        // 1. Find if a portal tab is already open
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(tab => DOMAINS.PORTALS.some(d => tab.url?.includes(d)));

        if (!portalTab) {
            // No portal open? Open it and stop.
            chrome.tabs.create({ url: APP_URLS.REGISTRATION });
            return;
        }

        // 2. We have a tab, but is it active?
        if (portalTab.id) {
            chrome.tabs.update(portalTab.id, { active: true });
            if (portalTab.windowId) chrome.windows.update(portalTab.windowId, { focused: true });
        }

        const targetTabId = portalTab.id;
        if (!targetTabId) return;

        // UI Loading State
        const originalHTML = btnExtractSaf.innerHTML;
        setSafeHTML(btnExtractSaf, '<div style="display:flex; align-items:center; gap:0.5rem;"><iconify-icon icon="lucide:loader-2" class="animate-spin"></iconify-icon> Extracting...</div>');
        btnExtractSaf.disabled = true;
        btnExtractSaf.classList.add('disabled-btn');

        try {
            // Attempt 1: Message directly
            let response = await sendMessageToTab(targetTabId, { action: 'EXTRACT_SAF_DATA' });

            // Attempt 2: If script isn't there, inject and retry
            if (!response) {
                const isInjected = await injectSafScraperScript(targetTabId);
                if (!isInjected) throw new Error("Could not access portal. Check extension permissions.");
                
                response = await sendMessageToTab(targetTabId, { action: 'EXTRACT_SAF_DATA' });
            }

            // Handle Final Response
            if (response?.success) {
                await chrome.storage.local.set({ extractedSchedule: response.payload });
                updateDataStatusVisibility();
                forceSyncWebToolsTabs(response.payload, 'SAF_EXTRACT');
                
                // Note: Hub notifications are now handled directly by the scraper script 
                // via local events for better responsiveness and to avoid double-triggering.
            } else {
                throw new Error(response?.error || "Failed to extract SAF data. Ensure you are on the correct page.");
            }
            
        } catch (error: any) {
            showModal({
                title: "Extraction Failed",
                message: error.message || "Could not locate SAF data. Ensure you are on the correct page.",
                type: "alert",
                severity: "error"
            });
        } finally {
            // Restore UI State
            btnExtractSaf.disabled = false;
            btnExtractSaf.classList.remove('disabled-btn');
            setSafeHTML(btnExtractSaf, originalHTML);
        }
    });
};

// Module: UI Components (Accordions)
const initAccordions = () => {
    const detailsElements = document.querySelectorAll('details.tool-group');

    detailsElements.forEach((detail) => {
        const summary = detail.querySelector('.tool-group-summary') as HTMLElement;
        const content = detail.querySelector('.tool-group-content') as HTMLElement;

        if (detail.hasAttribute('open')) {
            gsap.set(content, { height: 'auto', opacity: 1 });
        }

        summary.addEventListener('click', (e) => {
            e.preventDefault();
            AnimEngine.animatePressFeedback(summary);
            const isOpen = detail.hasAttribute('open');

            if (!isOpen) {
                detail.setAttribute('open', '');
                AnimEngine.animateAccordion(content, true);
            } else {
                AnimEngine.animateAccordion(content, false);
                setTimeout(() => detail.removeAttribute('open'), 400);
            }
        });
    });
};

// Module: Pre-Requisite Mapping
const initPrereqMapping = () => {
    const btnExtractPrereqs = document.getElementById('btn-extract-prereqs') as HTMLButtonElement;

    const handleExtraction = async (btn: HTMLButtonElement) => {
        // 1. Find the target tab (either active or any portal tab)
        const tabs = await chrome.tabs.query({});
        const portalTab = tabs.find(tab => DOMAINS.PORTALS.some(d => tab.url?.includes(d)));
        
        if (!portalTab) {
            beamLog("Curriculum portal not found. Opening...", "warn");
            chrome.tabs.create({ url: APP_URLS.REGISTRATION });
            return;
        }

        // 2. Wake up the portal tab and bring it to the front
        if (portalTab.id) {
            chrome.tabs.update(portalTab.id, { active: true });
            if (portalTab.windowId) chrome.windows.update(portalTab.windowId, { focused: true });
        }

        const targetTabId = portalTab.id;
        if (!targetTabId) return;

        // UI Loading State
        const originalHTML = btn.innerHTML;
        setSafeHTML(btn, `<div style="display:flex; align-items:center; gap:0.5rem;"><iconify-icon icon="lucide:loader-2" class="animate-spin"></iconify-icon> Extracting...</div>`);
        btn.disabled = true;
        btn.classList.add('disabled-btn');

        try {
            // Attempt 1: Message directly
            let response = await sendMessageToTab(targetTabId, { action: 'EXTRACT_CURRICULUM_DATA' });

            // Attempt 2: Inject and retry if script is missing
            if (!response) {
                const isInjected = await injectCurriculumScraperScript(targetTabId);
                if (!isInjected) throw new Error("Could not access portal. Check extension permissions.");
                
                response = await sendMessageToTab(targetTabId, { action: 'EXTRACT_CURRICULUM_DATA' });
            }

            if (response?.success) {
                // Store the extracted HTML and poke the visualizer
                await chrome.storage.local.set({ latestCurriculum: response.payload });
                forceSyncWebToolsTabs(response.payload, 'CURRICULUM');

                // Note: Hub notifications are now handled directly by the scraper script 
                // via local events for better responsiveness and to avoid double-triggering.
            } else {
                throw new Error(response?.error || "Failed to locate curriculum data.");
            }
        } catch (error: any) {
            showModal({
                title: "Extraction Failed",
                message: error.message || "An unexpected error occurred during extraction.",
                type: "alert",
                severity: "error"
            });
        } finally {
            // Restore UI State
            btn.disabled = false;
            btn.classList.remove('disabled-btn');
            setSafeHTML(btn, originalHTML);
        }
    };

    btnExtractPrereqs?.addEventListener('click', () => handleExtraction(btnExtractPrereqs));
};

// Module: Activity Console
const initActivityConsole = () => {
    const consoleOutput = document.getElementById('console-output') as HTMLDivElement;
    const btnClearConsole = document.getElementById('btn-clear-console') as HTMLButtonElement;

    const appendLogToConsole = (message: string, level: 'info' | 'warn' | 'error' | 'success' = 'info', timestamp?: string) => {
        if (!consoleOutput) return;

        const timeString = timestamp || new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        const line = document.createElement('div');
        line.className = 'console-line';
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'console-time';
        timeSpan.textContent = `[${timeString}]`;
        
        const messageSpan = document.createElement('span');
        messageSpan.className = `log-${level}`;
        messageSpan.textContent = message;

        line.appendChild(timeSpan);
        line.appendChild(messageSpan);
        
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    };

    // Hydrate from storage on initialization
    chrome.storage.local.get(['appLogs'], (result) => {
        if (result.appLogs && Array.isArray(result.appLogs)) {
            clearElement(consoleOutput); // Clear the "Console initialized" placeholder
            // Logs are stored most-recent-first, so we reverse for chronological display
            [...result.appLogs].reverse().forEach(log => {
                appendLogToConsole(log.message, log.level, log.timestamp);
            });
        }
    });

    // Listen for live beamed logs
    chrome.runtime.onMessage.addListener((request, _sender, _sendResponse) => {
        if (request.action === 'BEAM_LOG' && request.payload) {
            appendLogToConsole(request.payload.message, request.payload.level);
        }
    });

    btnClearConsole?.addEventListener('click', () => {
        AnimEngine.animatePressFeedback(btnClearConsole);
        chrome.storage.local.set({ appLogs: [] }, () => {
            clearElement(consoleOutput);
            appendLogToConsole('Console cleared.', 'info');
        });
    });
};

// Orchestration
const initGlobalPhysics = () => {
    // Attach GSAP hover bounds to all critical interactables
    const interactiveElements = document.querySelectorAll('.primary-action-btn, .icon-btn, .tool-btn');
    interactiveElements.forEach((el) => {
        AnimEngine.bindInteractiveHover(el as HTMLElement);
    });
};

// Module: Companion Hub Settings
const initHubSettings = () => {
    const toggleShowHub = document.getElementById('setting-show-hub') as HTMLInputElement;
    const selectPosition = document.getElementById('setting-hub-position') as HTMLSelectElement;
    const toggleShowParticles = document.getElementById('setting-show-particles') as HTMLInputElement;
    const toggleAutoPosition = document.getElementById('setting-auto-position') as HTMLInputElement;
    const toggleShowGuide = document.getElementById('setting-show-guide') as HTMLInputElement | null;
    const selectPreferredVertical = document.getElementById('setting-preferred-vertical') as HTMLSelectElement;
    
    const rowHubPosition = document.getElementById('row-hub-position') as HTMLElement;
    const rowPreferredVertical = document.getElementById('row-preferred-vertical') as HTMLElement;
    const rowShowParticles = document.getElementById('row-show-particles') as HTMLElement;

    if (!toggleShowHub || !selectPosition || !toggleShowParticles || !toggleAutoPosition || !selectPreferredVertical) return;

    // Load current config
    chrome.storage.local.get(['hubConfig'], (result) => {
        const config = result.hubConfig || {
            position: 'bottom-left',
            showParticle: true,
            showHub: true,
            showGuide: true,
            autoPosition: true,
            preferredVertical: 'bottom'
        };

        toggleShowHub.checked = config.showHub;
        selectPosition.value = config.position;
        toggleShowParticles.checked = config.showParticle;
        
        if (toggleShowGuide) {
            toggleShowGuide.checked = config.showGuide !== undefined ? config.showGuide : true;
        }
        
        // Defaults for new settings
        toggleAutoPosition.checked = config.autoPosition !== undefined ? config.autoPosition : true;
        selectPreferredVertical.value = config.preferredVertical || 'bottom';
        
        applyVisibilityLogic();
    });

    const applyVisibilityLogic = () => {
        if (toggleAutoPosition.checked) {
            rowHubPosition.style.display = 'none';
            rowPreferredVertical.style.display = 'flex';
        } else {
            rowHubPosition.style.display = 'flex';
            rowPreferredVertical.style.display = 'none';
        }

        // Dependency Logic: Visual Particles tied to Show Hub
        if (!toggleShowHub.checked) {
            toggleShowParticles.disabled = true;
            toggleShowParticles.checked = false; // Force off if hub is off
            rowShowParticles.style.opacity = '0.5';
            rowShowParticles.style.pointerEvents = 'none';
        } else {
            toggleShowParticles.disabled = false;
            rowShowParticles.style.opacity = '1';
            rowShowParticles.style.pointerEvents = 'auto';
        }
        
        // Ensure accordion height recalculates if the group is open
        const accordionContent = rowHubPosition.closest('.tool-group-content') as HTMLElement;
        if (accordionContent) {
            AnimEngine.recalculateHeight(accordionContent);
        }
    };

    const updateConfig = () => {
        applyVisibilityLogic();
        
        const newConfig = {
            position: selectPosition.value,
            showParticle: toggleShowParticles.checked,
            showHub: toggleShowHub.checked,
            showGuide: toggleShowGuide ? toggleShowGuide.checked : true, // Keep true if toggle is hidden
            autoPosition: toggleAutoPosition.checked,
            preferredVertical: selectPreferredVertical.value
        };

        chrome.storage.local.set({ hubConfig: newConfig });
    };

    toggleShowHub.addEventListener('change', updateConfig);
    selectPosition.addEventListener('change', updateConfig);
    toggleShowParticles.addEventListener('change', updateConfig);
    if (toggleShowGuide) toggleShowGuide.addEventListener('change', updateConfig);
    toggleAutoPosition.addEventListener('change', updateConfig);
    selectPreferredVertical.addEventListener('change', updateConfig);
};

/* CHANGELOG MANAGEMENT */
/**
 * Fetches the local changelog.json and renders it into the UI.
 * This keeps the popup lightweight while maintaining a detailed history.
 */
const initChangelog = async () => {
    const changelogContainer = document.getElementById('changelog-content');
    if (!changelogContainer) return;

    try {
        const response = await fetch('./changelog.json');
        if (!response.ok) throw new Error("Changelog not found");
        
        const data = await response.json();

        if (Array.isArray(data)) {
            clearElement(changelogContainer); // Clear loading state
            
            data.forEach((item: { version: string; date: string; changes: string[] }) => {
                const versionEntry = document.createElement('div');
                versionEntry.className = 'version-entry';

                const header = document.createElement('div');
                header.className = 'changelog-version-header';
                setSafeHTML(header, `
                    <span class="version-tag">${item.version}</span>
                    <span class="version-date">${item.date}</span>
                `);

                const changesList = document.createElement('ul');
                changesList.className = 'version-changes';
                item.changes.forEach(change => {
                    const li = document.createElement('li');
                    li.className = 'change-item';
                    li.textContent = change;
                    changesList.appendChild(li);
                });

                versionEntry.appendChild(header);
                versionEntry.appendChild(changesList);
                changelogContainer.appendChild(versionEntry);
            });
        }
    } catch (error) {
        setSafeHTML(changelogContainer, '<div class="muted-text" style="padding: 0.5rem;">Failed to load version history.</div>');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    updateDataStatusVisibility();
    initDataManagement();
    initAutoScheduleToggle();
    initSafExtraction();
    initPrereqMapping();
    initAccordions();
    initHubSettings();
    initActivityConsole();
    initChangelog();
    initGlobalPhysics();
});