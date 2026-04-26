import { runValidationCheck } from './dom_validator';
import { SUBJECT_CATALOG } from './subsmapping';
import { beamLog } from './logger';

declare const chrome: any;

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

interface ScheduleContainer {
    id: string;
    name: string;
    source?: string;
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
    '', 'TBA', 'N/A', 'NA', 'NONE', 'UNASSIGNED', 'TBD', '-', '--'
]);

const normalizeRoomLabel = (room: string) => room.trim().toUpperCase();
const isAssignedRoomLabel = (room: string) => !UNASSIGNED_ROOM_MARKERS.has(normalizeRoomLabel(room));
const createCourseSectionKey = (courseCode: string, section: string) => `${courseCode.trim()}-${section.trim()}`;
const createMeetingSignature = (day: number, start: string, end: string) => `${day}|${start.trim()}|${end.trim()}`;

const consumeRoomFromSignatureQueue = (signatureQueue: string[] | undefined) => {
    if (!signatureQueue || signatureQueue.length === 0) return null;
    return signatureQueue.shift() || null;
};

const consumeRoomFromEncounterQueue = (entry: PreservedRoomEntry, preferredRoom?: string) => {
    if (entry.roomsInEncounterOrder.length === 0) return null;

    if (!preferredRoom) {
        return entry.roomsInEncounterOrder.shift() || null;
    }

    const matchedIndex = entry.roomsInEncounterOrder.findIndex(room => room === preferredRoom);
    if (matchedIndex === -1) return null;

    const [matchedRoom] = entry.roomsInEncounterOrder.splice(matchedIndex, 1);
    return matchedRoom || null;
};

// Room Preservation Logic
const buildPreservedRoomIndex = (previousBlocks: PlotterBlock[]) => {
    const preservedRoomIndex = new Map<string, PreservedRoomEntry>();

    previousBlocks.forEach((block) => {
        const rawCourseCode = block.name.split(' - ')[0].trim();
        const roomLabel = block.room.trim();

        if (!rawCourseCode || !isAssignedRoomLabel(roomLabel)) return;

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

    if (!preservedEntry) return DEFAULT_UNASSIGNED_ROOM;

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

const isEnrollmentPortal = () => {
    const host = window.location.hostname.toLowerCase();
    return host.includes('oses') || host === 'localhost' || host === '127.0.0.1';
};

const isSafPreviewDocument = () => isEnrollmentPortal() && window.location.pathname.includes(SAF_PREVIEW_PATH_FRAGMENT);

const stopSafPreviewObserver = () => {
    if (safPreviewObserver) {
        safPreviewObserver.disconnect();
        safPreviewObserver = null;
    }
};

const tryProcessSafPreviewDocument = () => {
    if (!isSafPreviewDocument() || safPreviewExtractionCompleted) return;

    const hasAssessmentTable = document.querySelector('.assessment_schedule tbody tr');
    if (!hasAssessmentTable) return;

    chrome.storage.local.get(['autoSchedEnabled'], (result: StorageItems) => {
        if (!result.autoSchedEnabled || safPreviewExtractionCompleted) return;

        safPreviewExtractionCompleted = true;
        stopSafPreviewObserver();
        beamLog("[AutoSched] SAF Preview: Syncing room assignments", 'info');
        processSAFDocument(document);
    });
};

const startSafPreviewObserver = () => {
    if (!isSafPreviewDocument() || safPreviewExtractionCompleted) return;

    tryProcessSafPreviewDocument();

    if (safPreviewExtractionCompleted || safPreviewObserver) return;

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

// Global state for change tracking
let lastEnrolledCodes: string[] = [];

// XML Schedule Parser Logic
const processXMLToTargetJSON = (xmlString: string, prevBlocks: PlotterBlock[] = []) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const items = xmlDoc.querySelectorAll("Items");

    const blocks: PlotterBlock[] = [];
    const currentCodes: string[] = [];
    const colorMap = new Map<string, string>();

    items.forEach((item) => {
        const getNodeText = (tag: string) => item.querySelector(tag)?.textContent?.trim() || "";
        const courseCode = getNodeText("course_enrolled");

        if (!courseCode) return;
        currentCodes.push(courseCode);

        const catalogTitle = SUBJECT_CATALOG[courseCode];
        const courseName = catalogTitle ? `${courseCode} - ${catalogTitle}` : courseCode;
        const baseCode = courseCode.replace(/L$/, '');

        let color = colorMap.get(baseCode);
        if (!color) {
            let hash = 0;
            for (let i = 0; i < baseCode.length; i++) {
                hash = ((hash << 5) - hash) + baseCode.charCodeAt(i);
                hash |= 0;
            }
            const colorIndex = Math.abs(hash) % TW_COLORS.length;
            color = TW_COLORS[colorIndex];
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
                buildPreservedRoomIndex(prevBlocks),
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

    const finalJSON: ScheduleContainer = {
        id: "sched-live-autosync",
        name: "Auto Sched Live Sync",
        source: "auto-plot",
        blocks: blocks
    };

    // --- Subject Tracking Logic ---
    const added = currentCodes.filter(c => !lastEnrolledCodes.includes(c));
    const dropped = lastEnrolledCodes.filter(c => !currentCodes.includes(c));
    lastEnrolledCodes = [...currentCodes];

    let changeMsg = `[AutoSched] Intercepted ${blocks.length} subjects.`;
    if (added.length > 0) changeMsg = `[AutoSched] Added ${added.join(', ')}`;
    else if (dropped.length > 0) changeMsg = `[AutoSched] Dropped ${dropped.join(', ')}`;

    setTimeout(() => {
        runValidationCheck(blocks);
    }, 1500);

    chrome.storage.local.set({ latestSchedule: finalJSON }, () => {
        beamLog(changeMsg, 'success');
    });

    return finalJSON;
};

// SAF Document Parser Logic (Composite Key Strategy)
const processSAFDocument = (doc: Document) => {
    const rows = doc.querySelectorAll('.assessment_schedule tbody tr');
    const roomMap = new Map<string, string>();

    rows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 7) return;

        const courseCode = cells[0]?.textContent?.trim() || "";
        const section = cells[2]?.textContent?.trim() || "";

        if (!courseCode || courseCode.includes('TOTAL UNITS')) return;

        const daysArr = cells[4]?.textContent?.trim().split('/') || [];
        const timesArr = cells[5]?.textContent?.trim().split('/') || [];
        const roomsArr = cells[6]?.textContent?.trim().split('/') || [];

        daysArr.forEach((dayStr, idx) => {
            const dayLabel = dayStr.trim();
            const timeStr = timesArr[idx]?.trim() || timesArr[0]?.trim() || "";
            const roomStr = roomsArr[idx]?.trim() || roomsArr[roomsArr.length - 1]?.trim() || DEFAULT_UNASSIGNED_ROOM;

            if (!dayLabel || DAY_MAP[dayLabel] === undefined) return;

            const [startRaw, endRaw] = timeStr.split('-');
            
            // Strip seconds (e.g., 13:00:00 -> 13:00) to match XHR meeting signature
            const start = startRaw?.split(':').slice(0, 2).join(':') || "";
            const end = endRaw?.split(':').slice(0, 2).join(':') || "";

            const meetingSignature = createMeetingSignature(DAY_MAP[dayLabel], start, end);
            const courseSectionKey = createCourseSectionKey(courseCode, section);
            const exactKey = `${courseSectionKey}|${meetingSignature}`;

            roomMap.set(exactKey, roomStr);
        });
    });

    chrome.storage.local.get(['latestSchedule'], (result: StorageItems) => {
        if (!result.latestSchedule) return;

        const schedule = result.latestSchedule;
        let isUpdated = false;

        schedule.blocks.forEach((block) => {
            const rawCourseCode = block.name.split(' - ')[0].trim();
            const courseSectionKey = createCourseSectionKey(rawCourseCode, block.section);
            const meetingSignature = createMeetingSignature(block.day, block.start, block.end);
            const exactKey = `${courseSectionKey}|${meetingSignature}`;

            if (roomMap.has(exactKey)) {
                const assignedRoom = roomMap.get(exactKey)!;
                if (block.room !== assignedRoom) {
                    block.room = assignedRoom;
                    isUpdated = true;
                }
            }
        });

        if (isUpdated) {
            chrome.storage.local.set({ latestSchedule: schedule }, () => {
                beamLog("[AutoSched] Rooms Synced from SAF Preview", 'success');
                
                window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                    detail: {
                        action: 'UPDATE_HUB_STATUS',
                        title: 'Rooms Synced',
                        subtitle: 'Merged room data into sync.',
                        state: 'success'
                    }
                }));
            });
        }
    });
};

// Relay Listener
if (isSafPreviewDocument()) {
    startSafPreviewObserver();
}

window.addEventListener('message', (event) => {
    if (event.source === window && event.data.type === 'OSES_SCHEDULE_INTERCEPT') {
        if (!isEnrollmentPortal()) return;

        const action = event.data.action || "unknown";
        if (action === 'schedule_open') return;

        chrome.storage.local.get(['latestSchedule', 'autoSchedEnabled'], (result: StorageItems) => {
            if (result.autoSchedEnabled) {
                beamLog("[AutoSched] Intercepting Enrollment Data...", 'info');
                
                // Only signal Hub if not already in an active burst
                const now = Date.now();
                if (now - ((window as any)._lastHubSignal || 0) > 2000) {
                    (window as any)._lastHubSignal = now;
                    
                    window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                        detail: { action: 'SHOW_BEAMING' }
                    }));

                    window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
                        detail: {
                            action: 'UPDATE_HUB_STATUS',
                            title: 'Auto-Sync Active',
                            subtitle: 'Intercepting Enrollment Data...',
                            state: 'active'
                        }
                    }));
                }

                const prevBlocks = result.latestSchedule?.blocks || [];
                processXMLToTargetJSON(event.data.data, prevBlocks);
            }
        });
    }
});
console.log("[AutoSched] Interceptor relay armed.");
