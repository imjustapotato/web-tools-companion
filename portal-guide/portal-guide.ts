/**
 * Portal Guide Orchestrator
 * Bootstraps the Companion Hub, Logger, and Guide components inside a
 * Shadow DOM host, then wires them to chrome.runtime messages, local
 * storage events, and a custom window event relay.
 */
import { CompanionHub, HubConfig } from './status-dom';
import { LoggerHub } from './logger-dom';
import { PortalGuide } from './guide-dom';

/* Singleton References */
let hubHost: HTMLDivElement | null = null;
let hubUI: CompanionHub | null = null;
let logger: LoggerHub | null = null;
let guide: PortalGuide | null = null;

/* Default Configuration */
let currentConfig: HubConfig = {
    position: 'bottom-left',
    showParticle: true,
    showHub: true,
    showGuide: true
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

        // Hydrate initial state from storage so the hub reflects the last-known
        // autosched toggle and any in-progress guide sequence on page load
        chrome.storage.local.get(['autoSchedEnabled', 'hubConfig', 'activeGuide'], (result) => {
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

            if (result.activeGuide && guide) {
                const guideState = result.activeGuide;
                const currentPath = window.location.pathname.toLowerCase();
                const isOnSafPage = currentPath.includes('/student/saf') || currentPath.includes('/students/saf');

                // Reward Logic Helper
                const fireReward = () => {
                    hubUI?.update("Nice Work!", "Who's a Good Boy/Girl?", 'success');
                    logger?.log("Good Boy/Girl: Following instructions perfectly! 💖", 'success');
                    
                    // Who's a Good Boy? have some hearts
                    const numDroplets = Math.floor(Math.random() * 11) + 10;
                    for (let i = 0; i < numDroplets; i++) {
                        setTimeout(() => {
                            hubUI?.triggerHeartBurst(1);
                        }, i * 80); // Stagger para mag shower ng hearts
                    }
                };

                // Transitions the guide to a new state, persists it, and
                // re-renders the highlight. Resets count for the new phase.
                const advanceGuideState = (newType: string, newSelector: string, baseMessage: string, forceReward?: boolean) => {
                    const earnedReward = forceReward !== undefined ? forceReward : (guideState.count > 1 || guideState.earnedReward);
                    const updatedGuide = {
                        ...guideState,
                        type: newType,
                        selector: newSelector,
                        message: baseMessage,
                        count: 1, // reset count for the new state
                        earnedReward: !!earnedReward
                    };
                    
                    chrome.storage.local.set({ activeGuide: updatedGuide });
                    
                    // Clear stale highlights before rendering the new target
                    guide!.clearHighlights();
                    if (currentConfig.showGuide !== false) {
                        guide!.highlightElement(newSelector, baseMessage);
                    }
                    return updatedGuide;
                };

                if (guideState.type === 'wrong_page') {
                    if (isOnSafPage) {
                        const earnedReward = (guideState.count > 1 || guideState.earnedReward);
                        if (earnedReward) fireReward();

                        const rows = document.querySelectorAll('.assessment_schedule tbody tr');
                        if (rows.length === 0) {
                            advanceGuideState('missing_data', '#school_year', "Select a term and click Submit to view your schedule.", earnedReward);
                        } else {
                            chrome.storage.local.remove('activeGuide');
                        }
                    } else {
                        handleSnarkyUpdate(guideState, guide, [
                            "Pre, nandito ung button para sa SAF",
                            "Cmon. It's the one that's literally glowing blue.",
                            "Are we testing my patience? Click 'Schedule & Assessment' already."
                        ]);
                    }
                } 
                else if (guideState.type === 'missing_data') {
                    const table = document.querySelector('.assessment_schedule');
                    const checkCleanup = () => {
                        const rows = document.querySelectorAll('.assessment_schedule tbody tr');
                        const hasData = Array.from(rows).some(r => r.textContent?.toLowerCase().includes('subject') || r.children.length > 2);
                        
                        if (hasData) {
                            const reachedSnark = guideState.count >= 1 || guideState.earnedReward;
                            if (reachedSnark) {
                                fireReward();
                            } else {
                                hubUI?.update("Ready to Extract", "Subjects found. You can now trigger Extract SAF.", 'success');
                            }
                            logger?.log("SAF Data successfully populated. Click 'Extract from SAF' in the extension.", 'info');
                            chrome.storage.local.remove('activeGuide');
                            return true;
                        }
                        return false;
                    };

                    if (!checkCleanup()) {
                        guide.clearHighlights();
                        
                        // Escalating snark — paired arrays for the term dropdown and submit button
                        const snarkyVariants = [
                            "Select a term here...",
                            "Pili ka muna ng term mo pre :(",
                            "Unless you're graduating with zero units, pick a term and click the green button.",
                            "Select term. Click Submit. It's not rocket science."
                        ];

                        const submitSnarkyVariants = [
                            "...and then click Submit.",
                            "Tapos, pindutin mo na ito, kaya mo yan :)",
                            "The button is right there. It says 'Submit'.",
                            "Just click the green button. Please."
                        ];

                        const currentCount = guideState.count || 1;
                        let finalMsg;
                        let submitFinalMsg;
                        
                        if (currentCount <= snarkyVariants.length) {
                            finalMsg = snarkyVariants[currentCount - 1];
                            submitFinalMsg = submitSnarkyVariants[currentCount - 1];
                        } else {
                            const extraClicks = currentCount - snarkyVariants.length;
                            finalMsg = `${snarkyVariants[snarkyVariants.length - 1]} (x${extraClicks})`;
                            submitFinalMsg = `${submitSnarkyVariants[submitSnarkyVariants.length - 1]} (x${extraClicks})`;
                        }

                        // Reward is earned once the user has been snarked at (count > 1)
                        const isRewardEarned = guideState.earnedReward || currentCount > 1;

                        chrome.storage.local.set({ 
                            activeGuide: { 
                                ...guideState, 
                                count: currentCount + 1, 
                                message: finalMsg,
                                earnedReward: isRewardEarned
                            } 
                        });
                        
                        if (currentConfig.showGuide !== false) {
                            guide.highlightElement('#school_year', finalMsg);
                            guide.highlightElement('#submit', submitFinalMsg, 'bottom');
                        }

                        const submitBtn = document.querySelector('#submit') as HTMLButtonElement | null;
                        let slowAjaxTimer: ReturnType<typeof setTimeout> | null = null;

                        if (submitBtn) {
                            submitBtn.addEventListener('click', () => {
                                if (currentConfig.showGuide !== false) {
                                    guide.highlightElement('#submit', "Fetching your schedule... hang tight!", 'bottom');
                                }
                                
                                if (slowAjaxTimer) clearTimeout(slowAjaxTimer);
                                slowAjaxTimer = setTimeout(() => {
                                    if (currentConfig.showGuide !== false) {
                                        guide.highlightElement('#submit', "The portal is taking its sweet time. Try clicking again or refresh.", 'bottom');
                                    }
                                    hubUI?.update("Slow Portal", "AJAX is taking too long.", 'active');
                                }, 8000);
                            });
                        }

                        if (table) {
                            const observer = new MutationObserver(() => {
                                if (checkCleanup()) {
                                    if (slowAjaxTimer) clearTimeout(slowAjaxTimer);
                                    observer.disconnect();
                                }
                            });
                            observer.observe(table, { childList: true, subtree: true });
                        }
                    }
                }
                else if (guideState.type === 'wrong_page_curriculum') {
                    const isOnCurriculumPage = currentPath.includes('/program/curriculum');

                    // User navigated correctly then reward them if they endured snark
                    if (isOnCurriculumPage) {
                        const reachedSnark = guideState.count >= 1 || guideState.earnedReward;
                        if (reachedSnark) {
                            fireReward();
                        } else {
                            hubUI?.update("Ready to Extract", "Curriculum found. You can now trigger Extract Pre-requisites.", 'success');
                        }
                        chrome.storage.local.remove('activeGuide');
                        return;
                    }

                    // Still on the wrong page? escalate snark
                    guide.clearHighlights();
                    
                    const curriculumMessages = [
                        "Click 'Program Curriculum' on the left sidebar to see your subjects..",
                        "It's the one with the graduation cap icon. Right there.",
                        "I can't extract what isn't there. Click the link.",
                        "Okay, let's try this again. Click. The. Link. Please."
                    ];

                    const currentCount = guideState.count || 1;
                    let finalMsg = '';
                    
                    if (currentCount <= curriculumMessages.length) {
                        finalMsg = curriculumMessages[currentCount - 1];
                    } else {
                        const extraClicks = currentCount - curriculumMessages.length;
                        finalMsg = `${curriculumMessages[curriculumMessages.length - 1]} (x${extraClicks})`;
                    }

                    // Reward earned once snarked at
                    const isRewardEarned = guideState.earnedReward || currentCount > 1;
                    chrome.storage.local.set({ 
                        activeGuide: { 
                            type: 'wrong_page_curriculum', 
                            count: currentCount + 1, 
                            earnedReward: isRewardEarned 
                        } 
                    });

                    if (currentConfig.showGuide !== false) {
                        guide.highlightElement('a[href="/program/curriculum"]', finalMsg);
                    }
                    hubUI?.update("Wrong Page", "Navigate to Program Curriculum", 'error');
                }
            }
        });

        console.log("[Web Tools] Portal Companion Trinity Initialized.");
    } catch (e) {
        console.error("[Web Tools] Critical Hub initialization error:", e);
    }
}

// Escalates guide messages through a snarky progression, persists the
// new count, and re-renders the highlight with the updated message.
function handleSnarkyUpdate(guideState: any, guide: PortalGuide, snarkyMessages: string[]) {
    // Round up the count (handles the 1.5 "already rendered" flag)
    const currentCount = Math.ceil(guideState.count || 1);
    const newCount = currentCount + 1;
    
    let finalMessage = guideState.message;
    let displayMessage = "";

    if (currentCount < snarkyMessages.length) {
        finalMessage = snarkyMessages[currentCount];
        displayMessage = finalMessage;
    } else {
        finalMessage = snarkyMessages[snarkyMessages.length - 1];
        const extraClicks = currentCount - snarkyMessages.length + 1;
        displayMessage = `${finalMessage} (x${extraClicks})`;
    }

    chrome.storage.local.set({
        activeGuide: {
            ...guideState,
            message: finalMessage,
            count: newCount
        }
    });

    if (currentConfig.showGuide !== false) {
        guide.highlightElement(guideState.selector, displayMessage);
    }
}

// Syncs the host element's visibility with the user's hub/guide toggle settings
function applyHubVisibility() {
    if (!hubHost) return;
    
    // Completely hide the container if the user opted out
    if (!currentConfig.showHub) {
        hubHost.style.display = 'none';
    } else {
        hubHost.style.display = 'block';
    }

    // Clear stale highlights when guide is toggled off mid-session
    if (currentConfig.showGuide === false && guide) {
        guide.clearHighlights();
    }
}

/* Chrome Runtime Message Relay */
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
            if (currentConfig.showGuide !== false) {
                guide.highlightElement(request.selector, request.message, request.position || 'top');
            }
        }

        if (request.action === 'CLEAR_GUIDE' && guide) {
            guide.clearHighlights();
        }
    } catch (e) {
        console.error("[Web Tools] Error handling message in Portal Hub:", e);
    }
});

/* Custom Window Event Relay — used by content scripts that can't access chrome.runtime */
window.addEventListener('WEB_TOOLS_HUB_ACTION', (event: any) => {
    if (event.detail) handleHubAction(event.detail);
});

/* Storage Change Listener — keeps the hub in sync with popup/background changes */
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

    if (changes.activeGuide) {
        if (!changes.activeGuide.newValue && guide) {
            guide.clearHighlights();
        }
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
        if (currentConfig.showGuide !== false) {
            guide.highlightElement(request.selector, request.message, request.position || 'top');
        }
    }
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
    initializeHub();
} else {
    window.addEventListener('load', initializeHub);
}