// Map XML payloads to JSON schema.
import { runValidationCheck } from './dom_validator';

declare const chrome: any;

// Constants for mapping of date and colors.
const DAY_MAP: Record<string, number> = { 'M': 0, 'T': 1, 'W': 2, 'TH': 3, 'F': 4, 'S': 5 };
const TW_COLORS = [
    'bg-emerald-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-purple-600',
    'bg-rose-600', 'bg-amber-600', 'bg-sky-600', 'bg-lime-600',
    'bg-pink-600', 'bg-teal-600', 'bg-blue-600'
];

// Subject mapping for course codes.
// Extracted XML from XHR only contains the code; this catalog maps full titles.
import { SUBJECT_CATALOG } from './subsmapping';

interface PlotterBlock {
    name: string;
    day: number;
    start: string;
    end: string;
    room: string;
    section: string;
    color: string;
}

interface ScheduleContainer {
    id: string;
    name: string;
    blocks: PlotterBlock[];
}

interface StorageItems {
    latestSchedule?: ScheduleContainer;
    autoSchedEnabled?: boolean;
}

interface PreservedRoomEntry {
    roomsByMeetingSignature: Map<string, string[]>;
    roomsInEncounterOrder: string[];
}

const DEFAULT_UNASSIGNED_ROOM = 'TBA';
const UNASSIGNED_ROOM_MARKERS = new Set([
    '',
    'TBA',
    'N/A',
    'NA',
    'NONE',
    'UNASSIGNED',
    'TBD',
    '-',
    '--'
]);

const normalizeRoomLabel = (room: string) => room.trim().toUpperCase();

const isAssignedRoomLabel = (room: string) => !UNASSIGNED_ROOM_MARKERS.has(normalizeRoomLabel(room));

const createCourseSectionKey = (courseCode: string, section: string) => `${courseCode.trim()}-${section.trim()}`;

const createMeetingSignature = (day: number, start: string, end: string) => `${day}|${start.trim()}|${end.trim()}`;

const consumeRoomFromSignatureQueue = (signatureQueue: string[] | undefined) => {
    if (!signatureQueue || signatureQueue.length === 0) {
        return null;
    }

    return signatureQueue.shift() || null;
};

const consumeRoomFromEncounterQueue = (entry: PreservedRoomEntry, preferredRoom?: string) => {
    if (entry.roomsInEncounterOrder.length === 0) {
        return null;
    }

    if (!preferredRoom) {
        return entry.roomsInEncounterOrder.shift() || null;
    }

    const matchedIndex = entry.roomsInEncounterOrder.findIndex(room => room === preferredRoom);
    if (matchedIndex === -1) {
        return null;
    }

    const [matchedRoom] = entry.roomsInEncounterOrder.splice(matchedIndex, 1);
    return matchedRoom || null;
};

/**
 * Room Preservation Logic
 * Indexes rooms from a previous schedule by subject and time to maintain 
 * consistency when the network payload (XHR) returns empty room tags.
 */
const buildPreservedRoomIndex = (previousBlocks: PlotterBlock[]) => {
    const preservedRoomIndex = new Map<string, PreservedRoomEntry>();

    previousBlocks.forEach((block) => {
        const rawCourseCode = block.name.split(' - ')[0].trim();
        const roomLabel = block.room.trim();

        if (!rawCourseCode || !isAssignedRoomLabel(roomLabel)) {
            return;
        }

        const courseSectionKey = createCourseSectionKey(rawCourseCode, block.section);
        const meetingSignature = createMeetingSignature(block.day, block.start, block.end);

        if (!preservedRoomIndex.has(courseSectionKey)) {
            preservedRoomIndex.set(courseSectionKey, {
                roomsByMeetingSignature: new Map<string, string[]>(),
                roomsInEncounterOrder: []
            });
        }

        const preservedEntry = preservedRoomIndex.get(courseSectionKey)!;
        if (!preservedEntry.roomsByMeetingSignature.has(meetingSignature)) {
            preservedEntry.roomsByMeetingSignature.set(meetingSignature, []);
        }

        preservedEntry.roomsByMeetingSignature.get(meetingSignature)!.push(roomLabel);
        preservedEntry.roomsInEncounterOrder.push(roomLabel);
    });

    return preservedRoomIndex;
};

const getPreservedRoomLabel = (
    preservedRoomIndex: Map<string, PreservedRoomEntry>,
    courseCode: string,
    section: string,
    day: number,
    start: string,
    end: string
) => {
    const courseSectionKey = createCourseSectionKey(courseCode, section);
    const preservedEntry = preservedRoomIndex.get(courseSectionKey);

    if (!preservedEntry) {
        return DEFAULT_UNASSIGNED_ROOM;
    }

    const meetingSignature = createMeetingSignature(day, start, end);
    const signatureQueue = preservedEntry.roomsByMeetingSignature.get(meetingSignature);
    const signatureMatchedRoom = consumeRoomFromSignatureQueue(signatureQueue);

    if (signatureMatchedRoom) {
        consumeRoomFromEncounterQueue(preservedEntry, signatureMatchedRoom);
        return signatureMatchedRoom;
    }

    const encounteredRoom = consumeRoomFromEncounterQueue(preservedEntry);
    return encounteredRoom || DEFAULT_UNASSIGNED_ROOM;
};

// DOM Observer Logic for SAF Preview (Room Extraction)
const SAF_PREVIEW_PATH_FRAGMENT = 'saf_preview.php';
let safPreviewObserver: MutationObserver | null = null;
let safPreviewExtractionCompleted = false;

const isSafPreviewDocument = () => window.location.pathname.includes(SAF_PREVIEW_PATH_FRAGMENT);

const stopSafPreviewObserver = () => {
    if (safPreviewObserver) {
        safPreviewObserver.disconnect();
        safPreviewObserver = null;
    }
};

const tryProcessSafPreviewDocument = () => {
    if (!isSafPreviewDocument() || safPreviewExtractionCompleted) {
        return;
    }

    const hasAssessmentTable = document.querySelector('.assessment_schedule tbody tr');
    if (!hasAssessmentTable) {
        return;
    }

    chrome.storage.local.get(['autoSchedEnabled'], (result: StorageItems) => {
        if (!result.autoSchedEnabled || safPreviewExtractionCompleted) {
            return;
        }

        safPreviewExtractionCompleted = true;
        stopSafPreviewObserver();
        console.log("[AutoSched] SAF Preview context detected. Executing room extraction...");
        processSAFDocument(document);
    });
};

const startSafPreviewObserver = () => {
    if (!isSafPreviewDocument() || safPreviewExtractionCompleted) {
        return;
    }

    tryProcessSafPreviewDocument();

    if (safPreviewExtractionCompleted || safPreviewObserver) {
        return;
    }

    const observationTarget = document.documentElement || document;
    safPreviewObserver = new MutationObserver(() => {
        tryProcessSafPreviewDocument();
    });

    safPreviewObserver.observe(observationTarget, {
        childList: true,
        subtree: true,
    });
};

chrome.storage.onChanged.addListener((changes: Record<string, { oldValue: unknown; newValue: unknown }>, namespace: string) => {
    if (namespace === 'local' && changes.autoSchedEnabled?.newValue && isSafPreviewDocument()) {
        startSafPreviewObserver();
    }
});
// XML Schedule Parser Logic
const processXMLToTargetJSON = (xmlString: string, prevBlocks: PlotterBlock[] = []) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const items = xmlDoc.querySelectorAll("Items");

    const blocks: PlotterBlock[] = [];
    const preservedRoomIndex = buildPreservedRoomIndex(prevBlocks);
    const colorMap = new Map<string, string>();
    let colorIndex = 0;

    // Seed the color map with previously assigned colors to prevent shuffling
    prevBlocks.forEach(b => {
        // b.name is usually "CCS0001 - TITLE"
        const baseName = b.name.split('-')[0].trim().replace(/L$/, '');
        if (!colorMap.has(baseName)) {
            colorMap.set(baseName, b.color);
        }
    });

    items.forEach((item) => {
        const getNodeText = (tag: string) => item.querySelector(tag)?.textContent?.trim() || "";
        const courseCode = getNodeText("course_enrolled");

        if (!courseCode) return;

        // Auto-correct subject name if it exists in the catalog
        const catalogTitle = SUBJECT_CATALOG[courseCode];
        const courseName = catalogTitle ? `${courseCode} - ${catalogTitle}` : courseCode;

        // Normalize the base code (e.g., CCS0015L -> CCS0015) to group siblings
        const baseCode = courseCode.replace(/L$/, '');

        let color = colorMap.get(baseCode);
        if (!color) {
            color = TW_COLORS[colorIndex % TW_COLORS.length];
            colorIndex++;
            colorMap.set(baseCode, color);
        }

        const section = getNodeText("section_enrolled");
        const rawDays = getNodeText("days_enrolled");
        const rawTime = getNodeText("time_enrolled");
        const daysArr = rawDays.split('/').map(d => d.trim());
        const timesArr = rawTime.split('/').map(t => t.trim());

        daysArr.forEach((dayStr, index) => {
            if (!dayStr || DAY_MAP[dayStr] === undefined) return;

            const timeStr = timesArr[index] || timesArr[0];
            if (!timeStr) return;

            const [start, end] = timeStr.split('-').map(t => t.trim());
            const preservedRoomLabel = getPreservedRoomLabel(
                preservedRoomIndex,
                courseCode,
                section,
                DAY_MAP[dayStr],
                start,
                end
            );

            blocks.push({
                name: courseName,
                day: DAY_MAP[dayStr],
                start: start,
                end: end,
                room: preservedRoomLabel,
                section: section,
                color: color
            });
        });
    });

    const finalJSON = {
        id: "sched-live-autosync",
        name: "Auto Sched Live Sync",
        blocks: blocks
    };

    // DOM Integrity Check
    // Since XHR can sometimes be faster than DOM updates, we add a small delay
    setTimeout(() => {
        runValidationCheck(blocks);
    }, 1500);

    chrome.storage.local.set({ latestSchedule: finalJSON }, () => {
        console.log("[AutoSched] Intercepted schedule updated in storage.", finalJSON);
    });

    return finalJSON;
};

// SAF DOCUMENT PARSER LOGIC
const processSAFDocument = (doc: Document) => {
    const rows = doc.querySelectorAll('.assessment_schedule tbody tr');
    const roomMap = new Map<string, string[]>();

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        // Valid SAF rows have 7 columns
        if (cells.length >= 7) {
            const courseCode = cells[0]?.textContent?.trim() || "";
            const section = cells[2]?.textContent?.trim() || "";
            const roomStr = cells[6]?.textContent?.trim() || "";

            // Ignore footers or empty rows
            if (!courseCode || courseCode.includes('TOTAL UNITS')) return;

            const key = `${courseCode}-${section}`;
            // Handle split rooms like "F706 / F1204"
            const rooms = roomStr.split('/').map(r => r.trim());
            roomMap.set(key, rooms);
        }
    });

    console.log("[AutoSched] Extracted Room Map from SAF:", roomMap);

    // Merge into existing storage
    chrome.storage.local.get(['latestSchedule'], (result: StorageItems) => {
        if (!result.latestSchedule) {
            console.warn("[AutoSched] No existing schedule found to merge rooms into.");
            return;
        }

        const schedule = result.latestSchedule;
        let isUpdated = false;

        // Track room assignments to handle split schedules correctly sequentially
        const roomUsageTracker = new Map<string, number>();

        schedule.blocks.forEach((block) => {
            // Reconstruct the raw course code (e.g., "CCS0015L") to match the SAF map
            const rawCourseCode = block.name.split(' - ')[0].trim();
            const key = `${rawCourseCode}-${block.section}`;

            if (roomMap.has(key)) {
                const availableRooms = roomMap.get(key)!;
                let usageIndex = roomUsageTracker.get(key) || 0;

                const assignedRoom = availableRooms[usageIndex] || availableRooms[availableRooms.length - 1] || "TBA";

                if (block.room !== assignedRoom) {
                    block.room = assignedRoom;
                    isUpdated = true;
                }

                roomUsageTracker.set(key, usageIndex + 1);
            }
        });

        if (isUpdated) {
            chrome.storage.local.set({ latestSchedule: schedule }, () => {
                console.log("[AutoSched] Room assignments merged successfully!", schedule);
            });
        }
    });
};

// Relay listener
// Check A: Are we inside the SAF Preview document right now?
if (isSafPreviewDocument()) {
    startSafPreviewObserver();
}

// Check B: We are in the main portal. Listen for the XML XHR Intercepts.
window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'OSES_SCHEDULE_INTERCEPT') {
        const action = event.data.action || "unknown";
        const url = event.data.url || "unknown";

        console.log(`[AutoSched] Passive intercept triggered. URL: ${url}, Action: ${action}`);

        // Prevent syncing 'schedule_open' which contains all available courses, not enrolled courses
        if (action === 'schedule_open') {
            console.log("[AutoSched] Ignoring 'schedule_open' (Available Courses list).");
            return;
        }

        chrome.storage.local.get(['latestSchedule', 'autoSchedEnabled'], (result: StorageItems) => {
            if (result.autoSchedEnabled) {
                const prevBlocks = result.latestSchedule?.blocks || [];
                processXMLToTargetJSON(event.data.data, prevBlocks);
            } else {
                console.log("[AutoSched] AutoSched is disabled. Intercept ignored.");
            }
        });
    }
});
console.log("[AutoSched] Interceptor relay armed.");