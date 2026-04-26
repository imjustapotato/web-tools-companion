// Injected into solar.feutech.edu.ph to manually extract the SAF table DOM
import { beamLog } from './logger';

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
    let colorIndex = 0;

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return;

        const courseCode = cells[0]?.textContent?.trim() || "";
        const courseTitle = cells[1]?.textContent?.trim() || "";
        const section = cells[2]?.textContent?.trim() || "";

        // Skip footer rows or empty boundaries
        if (!courseCode || courseCode.includes('TOTAL UNITS')) return;

        // Ensure Lecture and Lab keep the same color visually
        const baseCode = courseCode.replace(/L$/, '');
        let assignedColor = colorMap.get(baseCode);
        
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
            // Send the extracted data to the background/bridge
            chrome.runtime.sendMessage({ 
                action: 'SAF_EXTRACTED', 
                payload: payload 
            }, () => {
                // Trigger the Hub's visual feedback
                chrome.runtime.sendMessage({
                    action: 'SHOW_BEAMING'
                });
                chrome.runtime.sendMessage({
                    action: 'UPDATE_HUB_STATUS',
                    title: 'Rooms Extracted!',
                    subtitle: 'Beamed to Visualizer',
                    state: 'success',
                    icon: '✅'
                });
            });
        });
    });

    return blocks;
};

// Listen for the extraction command from the popup
chrome.runtime.onMessage.addListener((request: any, sender: any, sendResponse: any) => {
    if (request.action === 'EXTRACT_SAF_DATA') {
        beamLog("Manual SAF extraction requested", 'info');
        
        const blocks = scrapeAssessmentTable();
        
        if (blocks.length === 0) {
            beamLog("Extraction failed: Could not locate SAF data", 'error');
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

        beamLog(`Successfully extracted ${blocks.length} blocks from SAF`, 'success');
        sendResponse({ success: true, payload: targetJSON });
        return true; // Keep message channel open for the response to be sent
    }
});