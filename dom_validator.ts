// Purpose: Scrape the ExtJS UI directly to validate the XHR payload or act as a fallback

export interface ScrapedCourse {
    course: string;
    section: string;
    units: number;
    days: string;
    time: string;
}


// Scrapes the "Registered Courses" grid from the ExtJS DOM
// Returns an array of course objects based strictly on what is visually rendered
export const scrapeExtJSGrid = (): ScrapedCourse[] => {
    // two grids, available and registered
    const gridBodies = document.querySelectorAll('.x-grid3-body');
    const targetGrid = gridBodies.length > 1 ? gridBodies[1] : gridBodies[0];

    if (!targetGrid) {
        console.warn("[DOM Scraper] Could not find ExtJS grid body.");
        return [];
    }

    const rows = targetGrid.querySelectorAll('.x-grid3-row');
    const scrapedData: ScrapedCourse[] = [];

    rows.forEach((row) => {
        const cells = row.querySelectorAll('.x-grid3-cell-inner');
        if (cells.length >= 6) {
            const courseText = cells[1]?.textContent?.trim() || "";
            if (!courseText) return;
            scrapedData.push({
                course: courseText,
                section: cells[2]?.textContent?.trim() || "",
                units: parseInt(cells[3]?.textContent?.trim() || "0", 10),
                days: cells[4]?.textContent?.trim() || "",
                time: cells[5]?.textContent?.trim() || ""
            });
        }
    });

    return scrapedData;
};


// simple comaparison health check
export const runValidationCheck = (xhrData: any[]) => {
    console.log("[Validator] Initiating DOM Scrape for validation...");
    const domData = scrapeExtJSGrid();

    // length integrity check
    if (xhrData.length !== domData.length) {
        console.error(`[Validator] Mismatch! XHR extracted ${xhrData.length} items, but DOM visually has ${domData.length} items.`);
    } else {
        console.log("[Validator] Counts match perfectly. UI and Network layer are in sync.");
    }

    return { isValid: xhrData.length === domData.length, domData };
};