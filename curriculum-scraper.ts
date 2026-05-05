/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */

// Extract raw HTML from #currTable for the Pre-requisite Mapping tool.

if (!(window as any).__CURRICULUM_SCRAPER_LOADED__) {
    (window as any).__CURRICULUM_SCRAPER_LOADED__ = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'EXTRACT_CURRICULUM_DATA') {
            const curriculumTable = document.getElementById('currTable');
            const pageHeader = document.querySelector('.content-header h1');

            // Validation: Ensure we are on the right page and the table exists
            if (!curriculumTable) {
                console.warn("[Curriculum Scraper] Extraction failed: Not on curriculum page.");
                
                // Get existing state or initialize new one
                chrome.storage.local.get(['activeGuide'], (result) => {
                    const currentCount = result.activeGuide?.count || 0;
                    
                    chrome.storage.local.set({
                        activeGuide: {
                            type: 'wrong_page_curriculum',
                            count: currentCount + 1,
                            earnedReward: result.activeGuide?.earnedReward || false
                        }
                    });
                });

                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'UPDATE_HUB_STATUS', title: 'Wrong Page', subtitle: 'Navigate to Program Curriculum', state: 'error' }
                }));
                
                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'HIGHLIGHT_ELEMENT', selector: 'a[href="/program/curriculum"]', message: "Click 'Program Curriculum' on the left sidebar." }
                }));

                sendResponse({ 
                    success: false, 
                    error: "Not on Program Curriculum page. Please navigate there first." 
                });
                return true;
            }

            console.log("[Curriculum Scraper] Table found. Extracting HTML...");

            // We wrap it in a div to preserve the table structure for the heuristic parser
            const payload = `
                <div class="extension-extracted-context">
                    ${pageHeader ? pageHeader.outerHTML : ''}
                    ${curriculumTable.outerHTML}
                </div>
            `;

            // Trigger Hub feedback
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: {
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Curriculum Extracted',
                    subtitle: 'Beamed to Web-Tools',
                    state: 'success'
                }
            }));

            // Trigger the fluid particle (Outbound Extract)
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
            }));

            sendResponse({ success: true, payload: payload });
            return true; // Keep message channel open for the response to be sent
        }
    });
}

