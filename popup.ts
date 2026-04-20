import 'iconify-icon';

declare const chrome: any; // Using 'any' for simplicity since we're in a browser extension context and don't have type definitions for the Chrome API in this file.

const btnAutoSched = document.getElementById('btn-auto-sched') as HTMLButtonElement;
const statusMsg = document.getElementById('status-msg') as HTMLDivElement;
const btnOpenTools = document.getElementById('btn-open-tools') as HTMLButtonElement;
const autoSchedIcon = document.getElementById('auto-sched-icon') as HTMLElement;

const showStatus = (msg: string, isError = false) => {
    statusMsg.textContent = msg;
    statusMsg.style.display = 'block';
    statusMsg.className = `status-message animate-pulse ${isError ? 'error' : 'success'}`;
};

const openVisualizer = () => {
    chrome.tabs.create({ url: 'https://tools.kendavila.me/' });
};

btnOpenTools.addEventListener('click', openVisualizer);

const setAutoSchedUIState = (isEnabled: boolean) => {
    if (isEnabled) {
        // Active "Listening" State
        btnAutoSched.style.backgroundColor = 'rgba(16, 185, 129, 0.1)';
        btnAutoSched.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        autoSchedIcon.setAttribute('icon', 'lucide:loader-2');
        autoSchedIcon.classList.add('animate-spin');
        autoSchedIcon.style.color = '#34d399';
    } else {
        // Normal State
        btnAutoSched.style.backgroundColor = '';
        btnAutoSched.style.borderColor = '';
        autoSchedIcon.setAttribute('icon', 'ic:baseline-auto-awesome');
        autoSchedIcon.classList.remove('animate-spin');
        autoSchedIcon.style.color = '';
    }
};

const ensureTabsAreOpen = () => {
    chrome.tabs.query({}, (tabs) => {
        let portalOpen = false;

        tabs.forEach(tab => {
            if (tab.url?.includes('feutech.edu.ph')) portalOpen = true;
        });

        if (!portalOpen) {
            chrome.tabs.create({ url: 'https://solar.feutech.edu.ph/course/registration' });
        }
    });
};

// Initialize UI from storage
let isAutoSchedActive = false;
const tooltip = document.getElementById('mouse-tooltip') as HTMLDivElement;

chrome.storage.local.get(['autoSchedEnabled'], (result) => {
    isAutoSchedActive = !!result.autoSchedEnabled;
    setAutoSchedUIState(isAutoSchedActive);
});

btnAutoSched.addEventListener('mousemove', (e) => {
    if (isAutoSchedActive) {
        tooltip.style.left = `${e.clientX + 15}px`;
        tooltip.style.top = `${e.clientY + 15}px`;
    }
});

btnAutoSched.addEventListener('mouseenter', () => {
    if (isAutoSchedActive) {
        tooltip.style.display = 'block';
        // force reflow
        tooltip.offsetHeight;
        tooltip.classList.add('visible');
    }
});

btnAutoSched.addEventListener('mouseleave', () => {
    tooltip.classList.remove('visible');
    setTimeout(() => {
        if (!tooltip.classList.contains('visible')) {
            tooltip.style.display = 'none';
        }
    }, 200);
});

btnAutoSched.addEventListener('click', async () => {
    chrome.storage.local.get(['autoSchedEnabled'], (result) => {
        const newState = !result.autoSchedEnabled;
        isAutoSchedActive = newState;
        chrome.storage.local.set({ autoSchedEnabled: newState }, () => {
            setAutoSchedUIState(newState);
            if (newState) {
                ensureTabsAreOpen();
            } else {
                chrome.storage.local.remove(['latestSchedule']);
                // hide tooltip immediately on turn off
                tooltip.classList.remove('visible');
                tooltip.style.display = 'none';
            }
        });
    });
});

// Smooth Accordion Logic
const detailsElements = document.querySelectorAll('details.tool-group');

detailsElements.forEach((detail) => {
    const summary = detail.querySelector('.tool-group-summary') as HTMLElement;
    const content = detail.querySelector('.tool-group-content') as HTMLElement;

    // Set initial state for already open details
    if (detail.hasAttribute('open')) {
        content.style.maxHeight = content.scrollHeight + 'px';
        content.style.opacity = '1';
    }

    summary.addEventListener('click', (e) => {
        e.preventDefault();

        if (!detail.hasAttribute('open')) {
            // Opening
            detail.setAttribute('open', '');
            content.classList.add('collapsing');

            // Calculate height and force reflow
            content.style.maxHeight = '0px';
            content.style.opacity = '0';
            content.offsetHeight; // trigger reflow

            content.style.maxHeight = content.scrollHeight + 'px';
            content.style.opacity = '1';

            // Clean up inline styles after transition
            setTimeout(() => {
                content.classList.remove('collapsing');
                content.style.maxHeight = '';
                content.style.opacity = '';
            }, 300);
        } else {
            // Closing
            content.classList.add('collapsing');

            // Set exact current height before animating to 0
            content.style.maxHeight = content.scrollHeight + 'px';
            content.style.opacity = '1';
            content.offsetHeight; // trigger reflow

            content.style.maxHeight = '0px';
            content.style.opacity = '0';

            // Remove open attribute after transition completes
            setTimeout(() => {
                detail.removeAttribute('open');
                content.classList.remove('collapsing');
                content.style.maxHeight = '';
                content.style.opacity = '';
            }, 300);
        }
    });
});