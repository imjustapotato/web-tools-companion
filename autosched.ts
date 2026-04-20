// injected into *://oses.feutech.edu.ph/*
// intrcept xml payloads and map them to my web tool as json schema

// constants
const DAY_MAP: Record<string, number> = { 'M': 1, 'T': 2, 'W': 3, 'TH': 4, 'F': 5, 'S': 6 };
const TW_COLORS = [
    'bg-rose-600', 'bg-pink-600', 'bg-purple-600', 'bg-violet-600',
    'bg-indigo-600', 'bg-blue-600', 'bg-sky-600', 'bg-cyan-600',
    'bg-teal-600', 'bg-emerald-600', 'bg-green-600', 'bg-lime-600',
    'bg-amber-600', 'bg-orange-600'
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

// XML parser & json formatter
const processXMLToTargetJSON = (xmlString: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlString, "text/xml");
    const items = xmlDoc.querySelectorAll("Items");

    const blocks: PlotterBlock[] = [];
    let colorIndex = 0;

    items.forEach((item) => {
        const getNodeText = (tag: string) => item.querySelector(tag)?.textContent?.trim() || "";
        const course = getNodeText("course_enrolled");

        if (!course) return;

        const section = getNodeText("section_enrolled");
        const rawDays = getNodeText("days_enrolled");
        const rawTime = getNodeText("time_enrolled");
        const color = TW_COLORS[colorIndex % TW_COLORS.length];
        colorIndex++;
        const daysArr = rawDays.split('/').map(d => d.trim());
        const timesArr = rawTime.split('/').map(t => t.trim());

        daysArr.forEach((dayStr, index) => {
            if (!dayStr || !DAY_MAP[dayStr]) return;

            const timeStr = timesArr[index] || timesArr[0];
            if (!timeStr) return;

            const [start, end] = timeStr.split('-').map(t => t.trim());

            blocks.push({
                name: course,
                day: DAY_MAP[dayStr],
                start: start,
                end: end,
                room: "TBA",
                section: section,
                color: color
            });
        });
    });

    // Construct the final JSON schema
    const finalJSON = {
        version: 1,
        id: "sched-live-autosync",
        name: "Live Auto Sched Data",
        blocks: blocks,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        meta: { defaultColor: "bg-sky-600" }
    };

    // Drop the payload into storage only if enabled
    chrome.storage.local.get(['autoSchedEnabled'], (result) => {
        if (result.autoSchedEnabled) {
            chrome.storage.local.set({ latestSchedule: finalJSON }, () => {
                console.log("[AutoSched] Schedule intercepted, parsed, and saved to storage.");
            });
        } else {
            console.log("[AutoSched] AutoSched is disabled. Intercept ignored.");
        }
    });

    return finalJSON;
};

// XHR interception bypass
const injectXHRInterceptor = () => {
    const script = document.createElement('script');
    script.textContent = `
        (function() {
            const originalSend = XMLHttpRequest.prototype.send;
            XMLHttpRequest.prototype.send = function() {
                this.addEventListener('load', function() {
                    // Target the specific endpoint
                    if (this._url && this._url.includes('loadData.php')) {
                        const responseText = this.responseText || "";
                        // Verify payload signature before passing it back
                        if (responseText.includes('<course_enrolled>')) {
                            window.postMessage({ type: 'OSES_SCHEDULE_INTERCEPT', data: responseText }, '*');
                        }
                    }
                });
                
                // Track the URL
                const originalOpen = XMLHttpRequest.prototype.open;
                XMLHttpRequest.prototype.open = function(method, url) {
                    this._url = url;
                    return originalOpen.apply(this, arguments);
                };
                
                return originalSend.apply(this, arguments);
            };
        })();
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove(); // Clean up traces
};

// Relay listener
window.addEventListener('message', (event) => {
    // Accept only from own window
    if (event.source === window && event.data.type === 'OSES_SCHEDULE_INTERCEPT') {
        console.log("[AutoSched] Passive intercept triggered.");
        processXMLToTargetJSON(event.data.data);
    }
});

// Floating UI Guide (Shadow DOM)

const injectFloatingGuide = () => {
    if (document.getElementById('web-tools-companion-shadow-root')) return;

    const host = document.createElement('div');
    host.id = 'web-tools-companion-shadow-root';
    Object.assign(host.style, {
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        zIndex: '999999'
    });

    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = `
        .widget {
            background-color: #0f172a;
            color: #f1f5f9;
            padding: 1rem;
            border-radius: 0.75rem;
            border: 1px solid rgba(16, 185, 129, 0.4);
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5);
            font-family: system-ui, sans-serif;
            font-size: 14px;
            width: 250px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            animation: slideUp 0.3s ease-out;
        }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .header { display: flex; align-items: center; gap: 8px; color: #34d399; font-weight: 600; }
        .pulse { width: 8px; height: 8px; background-color: #34d399; border-radius: 50%; box-shadow: 0 0 8px #34d399; animation: pulse 1.5s infinite; }
        @keyframes pulse { 0% { opacity: 1; box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); } 70% { opacity: 0.5; box-shadow: 0 0 0 6px rgba(52, 211, 153, 0); } 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); } }
        .text { color: #94a3b8; font-size: 12px; line-height: 1.4; }
        .btn { background-color: #3b82f6; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-weight: 500; text-align: center; text-decoration: none; display: block; margin-top: 4px; transition: background-color 0.2s; }
        .btn:hover { background-color: #2563eb; }
    `;

    const widget = document.createElement('div');
    widget.className = 'widget';
    widget.innerHTML = `
        <div class="header">
            <div class="pulse"></div>
            Auto Sched Live
        </div>
        <div class="text">
            Listening for schedule changes. Add/remove subjects to sync them automatically!
        </div>
        <a href="https://tools.kendavila.me/schedule-visualizer/" target="_blank" class="btn">Open Web Tools</a>
    `;

    shadow.appendChild(style);
    shadow.appendChild(widget);
    document.body.appendChild(host);
};

const removeFloatingGuide = () => {
    const host = document.getElementById('web-tools-companion-shadow-root');
    if (host) host.remove();
};

chrome.storage.local.get(['autoSchedEnabled'], (result) => {
    if (result.autoSchedEnabled) injectFloatingGuide();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local' && changes.autoSchedEnabled) {
        if (changes.autoSchedEnabled.newValue) {
            injectFloatingGuide();
        } else {
            removeFloatingGuide();
        }
    }
});

// Kickoff
injectXHRInterceptor();
console.log("[AutoSched] XHR Interceptor armed.");