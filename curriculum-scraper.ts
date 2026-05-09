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

// Extract raw HTML from #currTable for the Pre-requisite Mapping tool.

if (!(window as any).__CURRICULUM_SCRAPER_LOADED__) {
    (window as any).__CURRICULUM_SCRAPER_LOADED__ = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'EXTRACT_CURRICULUM_DATA') {
            console.log("[Curriculum Scraper] Extraction requested.");
            
            // Primary Selector
            let curriculumTable = document.getElementById('currTable');
            
            // Fallback Selectors
            if (!curriculumTable) {
                console.log("[Curriculum Scraper] #currTable not found. Trying fallbacks...");
                curriculumTable = document.querySelector('.table-curriculum') || 
                                 document.querySelector('table[id*="curr"]') ||
                                 document.querySelector('.content-body table');
            }

            const pageHeader = document.querySelector('.content-header h1') || document.querySelector('h1');

            // Validation: Ensure we are on the right page and the table exists
            if (!curriculumTable) {
                console.warn("[Curriculum Scraper] Extraction failed: Table not found.");
                
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
                    detail: { action: 'HIGHLIGHT_ELEMENT', selector: 'a[href*="/program/curriculum"]', message: "Click 'Program Curriculum' on the left sidebar." }
                }));

                sendResponse({ 
                    success: false, 
                    error: "Could not locate curriculum data. Ensure you are on the Program Curriculum page." 
                });
                return true;
            }

            console.log("[Curriculum Scraper] Table located. Extracting content...");

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

            // Trigger particle
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
            }));

            console.log("[Curriculum Scraper] Extraction successful.");
            sendResponse({ success: true, payload: payload });
            return true;
        }
    });
}

