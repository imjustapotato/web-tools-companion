// Injected into the portal to manually extract the SAF table DOM
import { beamLog } from './logger';

/* Lookup Tables */
const DAY_MAP: Record<string, number> = { 'M': 0, 'T': 1, 'W': 2, 'TH': 3, 'F': 4, 'S': 5 };
const TW_COLORS = [
    'bg-emerald-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-purple-600',
    'bg-rose-600', 'bg-amber-600', 'bg-sky-600', 'bg-lime-600',
    'bg-pink-600', 'bg-teal-600', 'bg-blue-600'
];

interface PlotterBlock {
    name: string;
    day: number;
    start: string;
    end: string;
    room: string;
    section: string;
    color: string;
}

const normalizeTimeBlock = (timeStr: string) => {
    const [startRaw, endRaw] = timeStr.split('-');
    const start = startRaw?.split(':').slice(0, 2).join(':') || "";
    const end = endRaw?.split(':').slice(0, 2).join(':') || "";
    return { start, end };
};

const scrapeAssessmentTable = (): PlotterBlock[] => {
    const rows = document.querySelectorAll('.assessment_schedule tbody tr');
    const blocks: PlotterBlock[] = [];
    
    const colorMap = new Map<string, string>();

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return;

        const courseCode = cells[0]?.textContent?.trim() || "";
        const courseTitle = cells[1]?.textContent?.trim() || "";
        const section = cells[2]?.textContent?.trim() || "";

        if (!courseCode || courseCode.includes('TOTAL UNITS')) return;

        // Strip trailing 'L' so lecture and lab share the same color
        const baseCode = courseCode.replace(/L$/, '');
        let assignedColor = colorMap.get(baseCode);
        
        // Deterministic hash ensures the same subject always gets the same color
        if (!assignedColor) {
            let hash = 0;
            for (let i = 0; i < baseCode.length; i++) {
                hash = ((hash << 5) - hash) + baseCode.charCodeAt(i);
                hash |= 0;
            }
            const colorIndex = Math.abs(hash) % TW_COLORS.length;
            assignedColor = TW_COLORS[colorIndex];
            colorMap.set(baseCode, assignedColor);
        }

        const daysArr = cells[4]?.textContent?.trim().split('/') || [];
        const timesArr = cells[5]?.textContent?.trim().split('/') || [];
        const roomsArr = cells[6]?.textContent?.trim().split('/') || [];

        daysArr.forEach((dayStr, idx) => {
            const dayLabel = dayStr.trim();
            if (!dayLabel || DAY_MAP[dayLabel] === undefined) return;

            const timeStr = timesArr[idx]?.trim() || timesArr[0]?.trim() || "";
            const roomStr = roomsArr[idx]?.trim() || roomsArr[roomsArr.length - 1]?.trim() || "TBA";

            const { start, end } = normalizeTimeBlock(timeStr);

            blocks.push({
                name: `${courseCode} - ${courseTitle}`,
                day: DAY_MAP[dayLabel],
                start,
                end,
                room: roomStr,
                section,
                color: assignedColor
            });
        });
    });

    return blocks;
};

// Count unique subjects by stripping the lab suffix before deduplication
const getUniqueSubjectCount = (blocksArray: PlotterBlock[]) => {
    const unique = new Set<string>();
    blocksArray.forEach(block => {
        let code = block.name ? block.name.split(' - ')[0] : "";
        if (code) {
            unique.add(code.trim().replace(/L$/i, ''));
        }
    });
    return unique.size;
};

// Guard flag prevents duplicate listeners when the content script re-injects
if (!(window as any).__SAF_SCRAPER_LOADED__) {
    (window as any).__SAF_SCRAPER_LOADED__ = true;
    
    chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
        if (request.action === 'EXTRACT_SAF_DATA') {
        beamLog("Manual SAF extraction requested", 'info');
        
        // 1. Context Mismatch Check
        const currentPath = window.location.pathname.toLowerCase();
        const isSafPage = currentPath.includes('/student/saf') || currentPath.includes('/students/saf');

        if (!isSafPage) {
            beamLog("Extraction failed: Not on SAF page.", 'error');
            
            // Persist guide state so the portal-guide can pick it up after navigation
            // Retrieve current state to preserve count progression if spam-clicked
            chrome.storage.local.get(['activeGuide'], (result) => {
                const currentCount = result.activeGuide?.count || 0;
                chrome.storage.local.set({
                    activeGuide: {
                        type: 'wrong_page',
                        selector: 'a[href*="/student/saf"]',
                        message: "Hey, it seems you aren't on the SAF page. Navigate first to Schedule & Assessment.",
                        count: currentCount + 1,
                        earnedReward: result.activeGuide?.earnedReward || false
                    }
                });
            });

            // Trigger Hub feedback for the error
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: {
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Wrong Page',
                    subtitle: 'Navigate to SAF to extract',
                    state: 'error'
                }
            }));
            
            // Trigger highlight immediately on the current page
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: {
                    action: 'HIGHLIGHT_ELEMENT',
                    selector: 'a[href*="/student/saf"]',
                    message: "Hey, it seems you aren't on the SAF page. Navigate first to Schedule & Assessment."
                }
            }));

            sendResponse({ success: false, error: "Not on SAF page. Please navigate to Schedule & Assessment." });
            return true;
        }

        // 2. UI Ghosting Check — portal loaded but critical elements are missing
        const hasSchoolYear = !!document.querySelector('#school_year');
        const hasSubmit = !!document.querySelector('#submit');

        if (!hasSchoolYear || !hasSubmit) {
            beamLog("Extraction failed: UI Controls missing (Ghosting).", 'error');
            
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'UPDATE_HUB_STATUS', title: 'UI Missing', subtitle: 'Portal elements missing', state: 'error' }
            }));
            
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'HIGHLIGHT_ELEMENT', selector: 'a[href="/logout"]', message: "The portal UI is ghosting us. Refresh the page or click here to Logout and try again.", position: 'bottom' }
            }));

            sendResponse({ success: false, error: "Critical portal UI elements are missing." });
            return true;
        }

        // 3. Proceed with Extraction
        const blocks = scrapeAssessmentTable();
        
        if (blocks.length === 0) {
            const rows = document.querySelectorAll('.assessment_schedule tbody tr');
            const hasDataRows = Array.from(rows).some(r => r.textContent?.toLowerCase().includes('subject') || r.children.length > 2);

            if (hasDataRows) {
                // Table has rows but scraper couldn't parse them — likely a DOM change
                beamLog("Extraction failed: Could not parse populated table data.", 'error');
                
                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'UPDATE_HUB_STATUS', title: 'Extraction Failed', subtitle: 'Portal DOM changed', state: 'error' }
                }));
                
                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: { action: 'HIGHLIGHT_ELEMENT', selector: '.assessment_schedule', message: "We see your subjects, but we can't read them! The portal structure might have changed. Please report this bug." }
                }));

                sendResponse({ success: false, error: "Extraction failed. The portal structure might have changed." });
                return true;
            }

            // No data rows at all — guide the user to select a term and submit
            beamLog("Extraction failed: Could not locate SAF data", 'error');
            
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
                detail: { action: 'UPDATE_HUB_STATUS', title: 'Empty SAF', subtitle: 'Select a term to view subjects', state: 'error' }
            }));
            
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'HIGHLIGHT_ELEMENT', selector: '#school_year', message: "Select a term here..." }
            }));
            window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                detail: { action: 'HIGHLIGHT_ELEMENT', selector: '#submit', message: "...and then click Submit.", position: 'bottom' }
            }));

            sendResponse({ success: false, error: "Could not locate SAF data. Ensure you have submitted the term form." });
            return true;
        }

        const targetJSON = {
            version: 1,
            id: 'saf-manual-extract',
            name: "Extracted Data SAF",
            source: 'manual-saf',
            blocks: blocks,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            meta: { defaultColor: "bg-sky-600" }
        };

        const uniqueCount = getUniqueSubjectCount(blocks);

        beamLog(`[SAF] Schedule Extracted (${uniqueCount} subjects)`, 'success');
        
        // Notify Hub of successful extraction
        window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
            detail: {
                action: 'UPDATE_HUB_STATUS',
                title: 'Schedule Extracted',
                subtitle: `${uniqueCount} subjects found on SAF`,
                state: 'success'
            }
        }));

        // Fire outbound beam particle to visually confirm data was sent
        window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
            detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
        }));

        sendResponse({ success: true, payload: targetJSON });
        return true; // Keep message channel open for async sendResponse
    }
});
}