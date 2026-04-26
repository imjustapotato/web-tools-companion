/**
 * Guide DOM Component
 * Handles highlighting Portal elements and showing guidance tooltips.
 */

export class PortalGuide {
    private activeHighlights: Map<string, HTMLElement> = new Map();

    /**
     * Highlights an element on the Portal with a soft glow and optional tooltip.
     * @param selector The CSS selector of the element to highlight.
     * @param message Optional message to show in a tooltip.
     */
    public highlightElement(selector: string, message?: string) {
        const target = document.querySelector(selector) as HTMLElement;
        if (!target) return;

        // Apply a pulse-glow class (assuming we inject styles into the page or use inline)
        target.style.transition = 'box-shadow 0.5s ease, outline 0.5s ease';
        target.style.outline = '2px solid rgba(59, 130, 246, 0.5)';
        target.style.outlineOffset = '2px';
        target.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.4)';
        
        this.activeHighlights.set(selector, target);

        if (message) {
            this.showTooltip(target, message);
        }
    }

    public clearHighlights() {
        this.activeHighlights.forEach((el) => {
            el.style.outline = '';
            el.style.boxShadow = '';
        });
        this.activeHighlights.clear();
        this.removeTooltips();
    }

    private showTooltip(target: HTMLElement, message: string) {
        const tooltip = document.createElement('div');
        tooltip.className = 'web-tools-guide-tooltip';
        tooltip.textContent = message;
        
        // Basic tooltip styling (to be refined in Shadow DOM or Global CSS)
        Object.assign(tooltip.style, {
            position: 'absolute',
            background: '#1e293b',
            color: '#f8fafc',
            padding: '8px 12px',
            borderRadius: '8px',
            fontSize: '12px',
            zIndex: '1000000',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap'
        });

        document.body.appendChild(tooltip);

        // Position it above the target
        const rect = target.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2)}px`;
        tooltip.style.top = `${rect.top + window.scrollY - tooltip.offsetHeight - 10}px`;
    }

    private removeTooltips() {
        document.querySelectorAll('.web-tools-guide-tooltip').forEach(t => t.remove());
    }
}
