/*
 * Web Tools Companion
 * Copyright (C) 2026 Kenneth Westhle A. Davila
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */
/**
 * DOM Utilities
 * Provides safe alternatives to innerHTML to satisfy Firefox Add-on store requirements.
 */

/**
 * Safely sets the content of an element from an HTML string by parsing it
 * into a document fragment and appending its children.
 * @param element The target element
 * @param html The HTML string to inject
 */
export function setSafeHTML(element: HTMLElement | ShadowRoot, html: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Clear existing content
    clearElement(element);

    // Append parsed nodes
    const fragment = document.createDocumentFragment();
    while (doc.body.firstChild) {
        fragment.appendChild(doc.body.firstChild);
    }
    element.appendChild(fragment);
}

/**
 * Safely injects an SVG string into an element.
 * @param element The target element
 * @param svgString The SVG string (e.g. "<svg>...</svg>")
 */
export function setSafeSVG(element: HTMLElement, svgString: string) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, 'image/svg+xml');
    const svgElement = doc.documentElement;

    // Check for parsing errors
    if (svgElement.querySelector('parsererror')) {
        console.error('SVG Parsing Error:', svgString);
        return;
    }

    clearElement(element);
    element.appendChild(svgElement);
}

/**
 * Clears all children from an element.
 * Safer alternative to element.innerHTML = ''
 */
export function clearElement(element: HTMLElement | ShadowRoot) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}


