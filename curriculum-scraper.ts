// Extract raw HTML from #currTable for the Pre-requisite Mapping tool.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_CURRICULUM_DATA') {
        const curriculumTable = document.getElementById('currTable');
        const pageHeader = document.querySelector('.content-header h1');

        // Validation: Ensure we are on the right page and the table exists
        if (!curriculumTable) {
            sendResponse({ 
                success: false, 
                error: "Curriculum table not found. Are you on the Program Curriculum page?" 
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

        sendResponse({ success: true, payload: payload });
        return true; // Keep message channel open for the response to be sent
    }
});