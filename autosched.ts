// intercept xml payloads and map them to my web tool as json schema
import { runValidationCheck } from './dom_validator';

declare const chrome: any;

// constants for mapping of date and colors.
const DAY_MAP: Record<string, number> = { 'M': 0, 'T': 1, 'W': 2, 'TH': 3, 'F': 4, 'S': 5 };
const TW_COLORS = [
    'bg-emerald-600', 'bg-cyan-600', 'bg-indigo-600', 'bg-purple-600',
    'bg-rose-600', 'bg-amber-600', 'bg-sky-600', 'bg-lime-600',
    'bg-pink-600', 'bg-teal-600', 'bg-blue-600'
];

// Exists because the extracted XML from XHR only contains the course code, this catalogue allows to map them to their full course titles.
const SUBJECT_CATALOG: Record<string, string> = {
    'CCS0001': 'INTRODUCTION TO COMPUTING LEC',
    'CCS0001L': 'INTRODUCTION TO COMPUTING LAB',
    'CCS0003': 'COMPUTER PROGRAMMING 1 LEC',
    'CCS0003L': 'COMPUTER PROGRAMMING 1 LAB',
    'CCS0005': 'INTRODUCTION TO HUMAN COMPUTER INTERACTION LEC',
    'CCS0005L': 'INTRODUCTION TO HUMAN COMPUTER INTERACTION LAB',
    'CCS0007': 'COMPUTER PROGRAMMING 2 LEC',
    'CCS0007L': 'COMPUTER PROGRAMMING 2 LAB',
    'CCS0015': 'DATA STRUCTURES AND ALGORITHMS LEC',
    'CCS0015L': 'DATA STRUCTURES AND ALGORITHMS LAB',
    'CCS0023': 'OBJECT ORIENTED PROGRAMMING LEC',
    'CCS0023L': 'OBJECT ORIENTED PROGRAMMING LAB',
    'CCS0043': 'APPLICATIONS DEVELOPMENT AND EMERGING TECHNOLOGIES LEC',
    'CCS0043L': 'APPLICATIONS DEVELOPMENT AND EMERGING TECHNOLOGIES LAB',
    'CCS0101': 'DESIGN THINKING CCS',
    'CCS0103': 'TECHNOPRENEURSHIP CCS',
    'CCS0105': 'PROFESSIONAL DEVELOPMENT COMPUTING PROFESSION',
    'GED0001': 'SPECIALIZED ENGLISH PROGRAM 1',
    'GED0004': 'PHYSICAL EDUCATION 1',
    'GED0006': 'PERSONAL AND PROFESSIONAL EFFECTIVENESS',
    'GED0007': 'ART APPRECIATION',
    'GED0009': 'READINGS IN PHILIPPINE HISTORY',
    'GED0011': 'SCIENCE, TECHNOLOGY AND SOCIETY',
    'GED0015': 'PHYSICAL EDUCATION 2',
    'GED0019': 'UNDERSTANDING THE SELF',
    'GED0021': 'SPECIALIZED ENGLISH PROGRAM 2',
    'GED0023': 'PHYSICAL EDUCATION 3',
    'GED0027': 'MATHEMATICS IN THE MODERN WORLD',
    'GED0031': 'PURPOSIVE COMMUNICATION',
    'GED0035': 'THE CONTEMPORARY WORLD',
    'GED0039': 'APPLIED STATISTICS',
    'GED0043': 'SPECIALIZED ENGLISH PROGRAM 3',
    'GED0047': 'FOREIGN LANGUAGE',
    'GED0049': 'LIFE AND WORKS OF RIZAL',
    'GED0061': 'ETHICS',
    'GED0073': 'GE ELECTIVE 2',
    'GED0081': 'COLLEGE PHYSICS 1 LECTURE',
    'GED0081L': 'COLLEGE PHYSICS 1 LABORATORY',
    'GED0083': 'COLLEGE PHYSICS 2 LECTURE',
    'GED0083L': 'COLLEGE PHYSICS 2 LABORATORY',
    'GED0085': 'GENDER SOCIETY',
    'IT0002': 'USER DESIGN FUNDAMENTALS',
    'IT0004': 'USER EXPERIENCE DESIGN FUNDAMENTALS',
    'IT0007': 'INFORMATION ASSURANCE AND SECURITY 2',
    'IT0009': 'FUNDAMENTALS OF DATABASE SYSTEMS',
    'IT0011': 'INTEGRATIVE PROGRAMMING AND TECHNOLOGIES',
    'IT0013': 'NETWORKING 1',
    'IT0015': 'NETWORKING 2',
    'IT0017': 'DISCRETE MATHEMATICS',
    'IT0019': 'QUANTITATIVE METHODS INCL MODELING AND SIMULATION',
    'IT0021': 'SYSTEM ADMINISTRATION AND MAINTENANCE',
    'IT0023': 'SYSTEM INTEGRATION AND ARCHITECTURE 1',
    'IT0025': 'SOCIAL AND PROFESSIONAL ISSUES',
    'IT0027': 'COURSE CODE PRESENT IN CURRICULUM (TITLE NOT FOUND IN SOURCE)',
    'IT0031': 'INTERNSHIP 1',
    'IT0033': 'INTERNSHIP 2 520 HOURS',
    'IT0035': 'APPLIED OPERATING SYSTEM',
    'IT0035L': 'APPLIED OPERATING SYSTEM LAB',
    'IT0037': 'SYSTEM ANALYSIS AND DESIGN',
    'IT0039': 'IT PROJECT MANAGEMENT',
    'IT0041': 'E-COMMERCE WITH DIGITAL MARKETING',
    'IT0043': 'WEB DESIGN WITH CLIENT SIDE SCRIPTING',
    'IT0043L': 'WEB DESIGN WITH CLIENT SIDE SCRIPTING LAB',
    'IT0047': 'IT ELECTIVE - COMPUTER SYSTEMS AND PLATFORM TECHNOLOGIES',
    'IT0049': 'IT ELECTIVE - WEB SYSTEM TECHNOLOGIES',
    'IT0051': 'IT ELECTIVE - HUMAN COMPUTER INTERACTION 2',
    'IT0053': 'IT ELECTIVE - EMERGING TECHNOLOGIES IN COMPUTING',
    'IT0057': 'IT ELECTIVE 6 - CERTIFICATION EXAM',
    'IT0103': 'IT SPECIALIZATION 8 - NETWORKING 3',
    'IT0119': 'INFORMATION MANAGEMENT',
    'IT0119L': 'INFORMATION MANAGEMENT LAB',
    'IT0125': 'INFORMATION ASSURANCE & SECURITY 1',
    'IT0129': 'IT ELECTIVE - SYSTEM INTEGRATION & ARCHITECTURE 2',
    'IT0200': 'IT SPECIALIZATION 3 - NETWORK DEFENSE ESSENTIALS',
    'IT0201': 'IT SPECIALIZATION 4 - INTRODUCTION TO CYBERSECURITY AND CYBERSECURITY ESSENTIALS',
    'IT0202': 'IT SPECIALIZATION 5 - ETHICAL HACKING ESSENTIALS',
    'IT0203': 'IT SPECIALIZATION 6 - DIGITAL FORENSICS ESSENTIALS',
    'IT0204': 'IT SPECIALIZATION 7 - CYBERSECURITY AND PRIVACY: LAWS, POLICIES, AND COMPLIANCE',
    'IT0205': 'IT SPECIALIZATION 9 - CLOUD SECURITY',
    'IT0207': 'CAPSTONE PROJECT 1 CST',
    'IT0209': 'CAPSTONE PROJECT 2 CST'
};

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

            blocks.push({
                name: courseName,
                day: DAY_MAP[dayStr],
                start: start,
                end: end,
                room: "TBA",
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