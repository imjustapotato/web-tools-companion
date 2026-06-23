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

// Extract raw HTML from the Network Map course table for the Pre-requisite Mapping tool's Subject State feature.
import { beamLog } from './logger';

if (!(window as any).__NETWORK_MAP_SCRAPER_LOADED__) {
    (window as any).__NETWORK_MAP_SCRAPER_LOADED__ = true;

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'EXTRACT_SUBJECT_STATE_DATA') {
            beamLog("Subject state extraction requested", 'info');

            // 1. Context Mismatch Check
            const currentPath = window.location.pathname.toLowerCase();
            const isNetworkMapPage = currentPath.includes('/network-map/curriculum');

            if (!isNetworkMapPage) {
                beamLog("Extraction failed: Not on Network Map page.", 'error');

                chrome.storage.local.get(['activeGuide'], (result) => {
                    const currentCount = result.activeGuide?.count || 0;
                    chrome.storage.local.set({
                        activeGuide: {
                            type: 'wrong_page_network_map',
                            selector: 'a[href*="/network-map/"]',
                            message: "Hey, it seems you aren't on the Network Map page. Navigate first to Network Map > Curriculum.",
                            count: currentCount + 1,
                            earnedReward: result.activeGuide?.earnedReward || false
                        }
                    });
                });

                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'UPDATE_HUB_STATUS', title: 'Wrong Page', subtitle: 'Navigate to Network Map', state: 'error' }
                }));

                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'HIGHLIGHT_ELEMENT', selector: 'a[href*="/network-map/"]', message: "Hey, it seems you aren't on the Network Map page. Navigate first to Network Map > Curriculum." }
                }));

                sendResponse({ success: false, error: "Not on Network Map page. Please navigate to Network Map > Curriculum." });
                return true;
            }

            // 2. Locate the course table
            let courseTable = document.querySelector('table.table-borderless');

            // Fallback Selectors
            if (!courseTable) {
                beamLog("table.table-borderless not found. Trying fallbacks...", 'warn');
                courseTable = document.querySelector('table[class*="table"]') || document.querySelector('table');
            }

            if (!courseTable) {
                beamLog("Extraction failed: Course table not found.", 'error');

                chrome.storage.local.get(['activeGuide'], (result) => {
                    const currentCount = result.activeGuide?.count || 0;
                    chrome.storage.local.set({
                        activeGuide: {
                            type: 'missing_data',
                            count: currentCount + 1,
                            earnedReward: result.activeGuide?.earnedReward || false
                        }
                    });
                });

                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'UPDATE_HUB_STATUS', title: 'Extraction Failed', subtitle: 'Course table not found', state: 'error' }
                }));

                sendResponse({ success: false, error: "Could not locate the course table on the Network Map page." });
                return true;
            }

            // 3. Extraction
            const payload = courseTable.outerHTML;

            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: {
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Subject State Extracted',
                    subtitle: 'Beamed to Web-Tools',
                    state: 'success'
                }
            }));

            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
            }));

            beamLog("Subject state extraction successful", 'success');
            sendResponse({ success: true, payload: payload });
            return true;
        }
    });
}
