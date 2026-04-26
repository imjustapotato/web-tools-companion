// This file can be safely overwritten.
import 'iconify-icon';

// Configuration & Constants
const APP_URLS = {
    VISUALIZER: 'https://tools.kendavila.me/',
    REGISTRATION: 'https://solar.feutech.edu.ph/course/registration'
};

const DOMAINS = {
    PORTALS: ['localhost:8000', 'feutech.edu.ph', 'feualabang.edu.ph', 'feudiliman.edu.ph'],
    TOOLS: ['localhost:5173', 'tools.kendavila.me', 'web-tools-teal.vercel.app']
};

// Module: Navigation & Tabs
const initNavigation = () => {
    const btnOpenTools = document.getElementById('btn-open-tools') as HTMLButtonElement;
    
    btnOpenTools.addEventListener('click', () => {
        chrome.tabs.create({ url: APP_URLS.VISUALIZER });
    });
};

const ensureRequiredTabsAreOpen = () => {
    chrome.tabs.query({}, (tabs) => {
        const isOpen = (domainList: string[]) => tabs.some(tab => domainList.some(d => tab.url?.includes(d)));
        
        const isPortalOpen = isOpen(DOMAINS.PORTALS);
        const isToolOpen = isOpen(DOMAINS.TOOLS);

        if (!isPortalOpen) chrome.tabs.create({ url: APP_URLS.REGISTRATION });
        if (!isToolOpen) chrome.tabs.create({ url: `${APP_URLS.VISUALIZER}schedule-visualizer/` });
    });
};

// Module: Data Management
const initDataManagement = () => {
    const btnResetData = document.getElementById('btn-reset-data') as HTMLButtonElement;
    
    btnResetData.addEventListener('click', async () => {
        const isConfirmed = confirm("Clear all stored schedule data? Your Web Tools view will be empty on the next refresh.");
        if (!isConfirmed) return;

        await chrome.storage.local.remove(['latestSchedule']);
        updateDataStatusVisibility();
        
        // Provide quick visual feedback
        const icon = btnResetData.querySelector('iconify-icon');
        if (!icon) return;
        
        icon.setAttribute('icon', 'lucide:check');
        setTimeout(() => icon.setAttribute('icon', 'lucide:refresh-ccw'), 1000);
    });
};

const updateDataStatusVisibility = () => {
    const dataStatusBadge = document.getElementById('data-status-badge') as HTMLElement;
    
    chrome.storage.local.get(['latestSchedule'], ({ latestSchedule }) => {
        if (latestSchedule) {
            dataStatusBadge.classList.remove('hidden');
        } else {
            dataStatusBadge.classList.add('hidden');
        }
    });
};

// Module: Auto-Plotting 
const initAutoScheduleToggle = () => {
    const btnAutoSched = document.getElementById('btn-auto-sched') as HTMLButtonElement;
    const autoSchedIcon = document.getElementById('auto-sched-icon') as HTMLElement;
    const tooltip = document.getElementById('mouse-tooltip') as HTMLDivElement;
    
    let isFeatureEnabled = false;

    const renderAutoScheduleState = (isEnabled: boolean) => {
        if (isEnabled) {
            btnAutoSched.classList.add('is-listening');
            autoSchedIcon.setAttribute('icon', 'lucide:loader-2');
            autoSchedIcon.classList.add('animate-spin');
            autoSchedIcon.style.color = 'var(--success-light)';
        } else {
            btnAutoSched.classList.remove('is-listening');
            autoSchedIcon.setAttribute('icon', 'ic:baseline-auto-awesome');
            autoSchedIcon.classList.remove('animate-spin');
            autoSchedIcon.style.color = '';
        }
    };

    const handleTooltipMovement = (e: MouseEvent) => {
        if (!isFeatureEnabled) return;
        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
    };

    const hideTooltip = () => {
        tooltip.classList.remove('visible');
        setTimeout(() => {
            if (!tooltip.classList.contains('visible')) tooltip.style.display = 'none';
        }, 200);
    };

    // Initialization
    chrome.storage.local.get(['autoSchedEnabled'], (result) => {
        isFeatureEnabled = !!result.autoSchedEnabled;
        renderAutoScheduleState(isFeatureEnabled);
    });

    // Event Listeners
    btnAutoSched.addEventListener('mousemove', handleTooltipMovement);
    
    btnAutoSched.addEventListener('mouseenter', () => {
        if (!isFeatureEnabled) return;
        tooltip.style.display = 'block';
        tooltip.offsetHeight; // Force reflow
        tooltip.classList.add('visible');
    });

    btnAutoSched.addEventListener('mouseleave', hideTooltip);

    btnAutoSched.addEventListener('click', () => {
        isFeatureEnabled = !isFeatureEnabled;
        
        chrome.storage.local.set({ autoSchedEnabled: isFeatureEnabled }, () => {
            renderAutoScheduleState(isFeatureEnabled);
            
            if (isFeatureEnabled) {
                ensureRequiredTabsAreOpen();
            } else {
                hideTooltip();
            }
        });
    });
};

// Module: SAF Extraction
// Wraps chrome.tabs.sendMessage in a Promise for cleaner async/await flows
const sendMessageToTab = (tabId: number, message: any): Promise<any> => {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, message, (response) => {
            resolve(chrome.runtime.lastError ? null : response);
        });
    });
};

const injectScraperScript = (tabId: number): Promise<boolean> => {
    return new Promise((resolve) => {
        chrome.scripting.executeScript({
            target: { tabId },
            files: ['saf-scraper.js']
        }, () => resolve(!chrome.runtime.lastError));
    });
};

const forceSyncWebToolsTabs = (payload?: any) => {
    chrome.tabs.query({}, (tabs) => {
        const matchingTabs = tabs.filter(tab => DOMAINS.TOOLS.some(url => tab.url?.includes(url)));

        if (matchingTabs.length > 0) {
            // Just focus the first matching tab instead of reloading
            const targetTab = matchingTabs[0];
            if (targetTab.id) {
                chrome.tabs.update(targetTab.id, { active: true });
                // Explicitly poke the bridge to pull data (bypasses background throttling)
                chrome.tabs.sendMessage(targetTab.id, { 
                    type: 'SYNC_DATA',
                    payload: payload 
                }).catch(() => {});
                
                // If the tab is in a different window, we might need to focus that window too
                if (targetTab.windowId) chrome.windows.update(targetTab.windowId, { focused: true });
            }
        } else {
            chrome.tabs.create({ url: `${APP_URLS.VISUALIZER}schedule-visualizer/` });
        }
    });
};

const initSafExtraction = () => {
    const btnExtractSaf = document.getElementById('btn-extract-saf') as HTMLButtonElement;
    
    btnExtractSaf.addEventListener('click', async () => {
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
                const isInjected = await injectScraperScript(activeTab.id);
                if (!isInjected) throw new Error("Could not access portal. Check extension permissions.");
                
                response = await sendMessageToTab(activeTab.id, { action: 'EXTRACT_SAF_DATA' });
            }

            // Handle Final Response
            if (response?.success) {
                await chrome.storage.local.set({ latestSchedule: response.payload });
                updateDataStatusVisibility();
                forceSyncWebToolsTabs(response.payload);
            } else {
                throw new Error(response?.error || "Failed to extract SAF data. Ensure you are on the correct page.");
            }
            
        } catch (error: any) {
            alert(error.message);
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
            content.style.maxHeight = content.scrollHeight + 'px';
            content.style.opacity = '1';
        }

        summary.addEventListener('click', (e) => {
            e.preventDefault();

            if (!detail.hasAttribute('open')) {
                // Open logic
                detail.setAttribute('open', '');
                content.classList.add('collapsing');
                content.style.maxHeight = '0px';
                content.style.opacity = '0';
                content.offsetHeight; // force reflow

                content.style.maxHeight = content.scrollHeight + 'px';
                content.style.opacity = '1';

                setTimeout(() => {
                    content.classList.remove('collapsing');
                    content.style.maxHeight = 'none';
                    content.style.opacity = '1';
                }, 300);
            } else {
                // Close logic
                content.classList.add('collapsing');
                content.style.maxHeight = content.scrollHeight + 'px';
                content.style.opacity = '1';
                content.offsetHeight; // force reflow

                content.style.maxHeight = '0px';
                content.style.opacity = '0';

                setTimeout(() => {
                    detail.removeAttribute('open');
                    content.classList.remove('collapsing');
                    content.style.maxHeight = '';
                    content.style.opacity = '';
                }, 300);
            }
        });
    });
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
        chrome.storage.local.set({ appLogs: [] }, () => {
            consoleOutput.innerHTML = '';
            appendLogToConsole('Console cleared.', 'info');
        });
    });
};

// Orchestration
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    updateDataStatusVisibility();
    initDataManagement();
    initAutoScheduleToggle();
    initSafExtraction();
    initAccordions();
    initActivityConsole();
});