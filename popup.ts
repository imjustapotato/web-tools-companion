import 'iconify-icon';
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
 * Note: 'Active Poking' bypasses Chrome's background tab throttling.
 */
const forceSyncWebToolsTabs = (payload?: any, type: 'SAF' | 'SAF_EXTRACT' | 'CURRICULUM' = 'SAF') => {
    chrome.tabs.query({}, (tabs) => {
        const matchingTabs = tabs.filter(tab => DOMAINS.TOOLS.some(url => tab.url?.includes(url)));

        if (matchingTabs.length > 0) {
            const targetTab = matchingTabs[0];
            if (targetTab.id) {
                chrome.tabs.update(targetTab.id, { active: true });
                
                // Seamless message for all tools to avoid state/parsing interruptions
                chrome.tabs.sendMessage(targetTab.id, { 
                    type: 'SYNC_DATA',
                    dataType: type,
                    payload: payload 
                }).catch(() => {});
                
                // If the tab is in a different window, we might need to focus that window too
                if (targetTab.windowId) chrome.windows.update(targetTab.windowId, { focused: true });
            }
        } else {
            const isSaf = type === 'SAF' || type === 'SAF_EXTRACT';
            const path = isSaf ? 'schedule-visualizer/' : 'portal-parser/';
            chrome.tabs.create({ url: `${APP_URLS.VISUALIZER}${path}` });
        }
    });
};

const initSafExtraction = () => {
    const btnExtractSaf = document.getElementById('btn-extract-saf') as HTMLButtonElement;
    
    btnExtractSaf.addEventListener('click', async () => {
        AnimEngine.animatePressFeedback(btnExtractSaf);
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) return;

        // UI Loading State
        const originalHtml = btnExtractSaf.innerHTML;
        btnExtractSaf.innerHTML = '<div style="display:flex; align-items:center; gap:0.5rem;"><iconify-icon icon="lucide:loader-2" class="animate-spin"></iconify-icon> Extracting...</div>';
        btnExtractSaf.classList.add('disabled-btn');

        try {
            // Attempt 1: Message directly
            let response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_SAF_DATA' });

            // Attempt 2: If script isn't there, inject and retry
            if (!response) {
                const isInjected = await injectSafScraperScript(activeTab.id);
                if (!isInjected) throw new Error("Could not access portal. Check extension permissions.");
                
                response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_SAF_DATA' });
            }

            // Handle Final Response
            if (response?.success) {
                await chrome.storage.local.set({ extractedSchedule: response.payload });
                updateDataStatusVisibility();
                forceSyncWebToolsTabs(response.payload, 'SAF_EXTRACT');
                
                // Notify the Portal Hub
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'SHOW_BEAMING'
                });
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Rooms Extracted!',
                    subtitle: 'Beamed to Visualizer',
                    state: 'success',
                    icon: '🏢'
                });
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
            btnExtractSaf.classList.remove('disabled-btn');
            btnExtractSaf.innerHTML = originalHtml;
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
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!activeTab?.id) return;

        // UI Loading State
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<div style="display:flex; align-items:center; gap:0.5rem;"><iconify-icon icon="lucide:loader-2" class="animate-spin"></iconify-icon> Extracting...</div>`;
        btn.classList.add('disabled-btn');

        try {
            // Attempt 1: Message directly
            let response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_CURRICULUM_DATA' });

            // Attempt 2: Inject and retry if script is missing
            if (!response) {
                const isInjected = await injectCurriculumScraperScript(activeTab.id);
                if (!isInjected) throw new Error("Could not access portal. Check extension permissions.");
                
                response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_CURRICULUM_DATA' });
            }

            if (response?.success) {
                // Store the extracted HTML and poke the visualizer
                await chrome.storage.local.set({ latestCurriculum: response.payload });
                forceSyncWebToolsTabs(response.payload, 'CURRICULUM');

                // Notify the Portal Hub
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'SHOW_BEAMING'
                });
                chrome.tabs.sendMessage(activeTab.id, {
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Curriculum Beamed!',
                    subtitle: 'Check the Portal Parser',
                    state: 'success',
                    icon: '🗺️'
                });
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
            btn.classList.remove('disabled-btn');
            btn.innerHTML = originalHtml;
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
            consoleOutput.innerHTML = ''; // Clear the "Console initialized" placeholder
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
            consoleOutput.innerHTML = '';
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

document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    updateDataStatusVisibility();
    initDataManagement();
    initAutoScheduleToggle();
    initSafExtraction();
    initPrereqMapping();
    initAccordions();
    initActivityConsole();
    initGlobalPhysics();
});