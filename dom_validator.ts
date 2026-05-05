/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */

// Scrape the ExtJS UI directly to validate the XHR payload or act as a fallback

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


// Normalize and count unique subjects
const getUniqueSubjectCount = (data: any[], isDOM: boolean) => {
    const unique = new Set<string>();
    data.forEach(item => {
        // Extract raw course code
        let code = isDOM ? item.course : (item.name ? item.name.split(' - ')[0] : "");
        if (code) {
            // Strip trailing 'L' (case-insensitive) to combine lab and lecture into one base subject
            const baseCode = code.trim().replace(/L$/i, '');
            unique.add(baseCode);
        }
    });
    return unique.size;
};

// simple comaparison health check
export const runValidationCheck = (xhrData: any[]) => {
    console.log("[Validator] Initiating DOM Scrape for validation...");
    const domData = scrapeExtJSGrid();

    const xhrUniqueCount = getUniqueSubjectCount(xhrData, false);
    const domUniqueCount = getUniqueSubjectCount(domData, true);

    // length integrity check
    if (xhrUniqueCount !== domUniqueCount) {
        // Silenced for Extension UI, but kept in Browser Console for debugging
        console.log(`[Validator] Mismatch! XHR extracted ${xhrUniqueCount} unique subjects (${xhrData.length} meetings), but DOM visually has ${domUniqueCount} unique subjects (${domData.length} rows).`);
    } else {
        console.log(`[Validator] Counts match perfectly. UI and Network layer both report ${xhrUniqueCount} unique subjects.`);
    }

    return { isValid: xhrUniqueCount === domUniqueCount, domData };
};