/**
 * Guide DOM Component
 * Handles highlighting Portal elements and showing guidance tooltips.
 */
import { gsap } from 'gsap';

export class PortalGuide {
    private activeHighlights: Map<string, HTMLElement> = new Map();

    constructor() {
        this.injectStyles();
    }

    private injectStyles() {
        if (document.getElementById('web-tools-guide-styles')) return;
        const style = document.createElement('style');
        style.id = 'web-tools-guide-styles';
        style.textContent = `
            @keyframes pulse-glow {
                0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(59, 130, 246, 0); }
                100% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0); }
            }
            .web-tools-guide-highlight {
                position: relative !important;
                outline: 2px solid #3b82f6 !important;
                outline-offset: 2px !important;
                animation: pulse-glow 2s infinite cubic-bezier(0.4, 0, 0.2, 1) !important;
                border-radius: 4px;
                z-index: 99999 !important;
            }
            .web-tools-guide-tooltip {
                position: absolute;
                background: rgba(15, 23, 42, 0.95);
                backdrop-filter: blur(8px);
                color: #f8fafc;
                padding: 10px 14px;
                border-radius: 8px;
                font-size: 13px;
                font-weight: 500;
                font-family: 'Outfit', system-ui, sans-serif;
                z-index: 1000000;
                box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);
                border: 1px solid rgba(59, 130, 246, 0.5);
                pointer-events: none;
                max-width: 250px;
                line-height: 1.4;
                opacity: 0;
            }
            .web-tools-guide-tooltip::after {
                content: '';
                position: absolute;
                top: 100%;
                left: 50%;
                margin-left: -6px;
                border-width: 6px;
                border-style: solid;
                border-color: rgba(15, 23, 42, 0.95) transparent transparent transparent;
            }
            .web-tools-guide-tooltip-bottom::after {
                top: auto;
                bottom: 100%;
                border-color: transparent transparent rgba(15, 23, 42, 0.95) transparent;
            }
        `;
        document.head.appendChild(style);
    }

    // Applies a pulse-glow highlight to the target element and optionally
    // attaches a floating tooltip. Skips if the selector is already active.
    public highlightElement(selector: string, message?: string, position: 'top' | 'bottom' = 'top') {

        if (this.activeHighlights.has(selector)) return;

        const target = document.querySelector(selector) as HTMLElement;
        if (!target) return;

        target.classList.add('web-tools-guide-highlight');
        this.activeHighlights.set(selector, target);

        if (message) {
            this.showTooltip(target, message, selector, position);
        }

        // Auto-dismiss the visual highlight on click, but keep the guide
        // state in storage so the destination page can fire the reward
        const clearHandler = () => {
            this.clearHighlight(selector);
            target.removeEventListener('click', clearHandler);
        };
        target.addEventListener('click', clearHandler);
    }

    public clearHighlight(selector: string) {
        const target = this.activeHighlights.get(selector);
        if (target) {
            target.classList.remove('web-tools-guide-highlight');
            this.activeHighlights.delete(selector);
        }
        
        // Match by data attribute instead of querySelector to handle complex selectors
        const tooltip = Array.from(document.querySelectorAll('.web-tools-guide-tooltip'))
            .find(t => t.getAttribute('data-target') === selector);

        if (tooltip) {
            gsap.to(tooltip, {
                opacity: 0,
                y: -10,
                duration: 0.3,
                ease: 'power2.in',
                onComplete: () => tooltip.remove()
            });
        }
    }

    public clearHighlights() {
        this.activeHighlights.forEach((el) => {
            el.classList.remove('web-tools-guide-highlight');
        });
        this.activeHighlights.clear();
        this.removeTooltips();
    }

    private showTooltip(target: HTMLElement, message: string, selector: string, position: 'top' | 'bottom') {
        const tooltip = document.createElement('div');
        tooltip.className = 'web-tools-guide-tooltip';
        if (position === 'bottom') tooltip.classList.add('web-tools-guide-tooltip-bottom');
        
        tooltip.textContent = message;
        tooltip.setAttribute('data-target', selector);
        
        document.body.appendChild(tooltip);

        // Defer until after paint so offsetWidth is measured correctly
        requestAnimationFrame(() => {
            const rect = target.getBoundingClientRect();
            const left = rect.left + window.scrollX + (rect.width / 2) - (tooltip.offsetWidth / 2);
            
            const top = position === 'bottom' 
                ? rect.bottom + window.scrollY + 10 
                : rect.top + window.scrollY - tooltip.offsetHeight - 10;
            
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;

            /* GSAP Entrance */
            gsap.fromTo(tooltip, 
                { opacity: 0, y: 10, scale: 0.95 },
                { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }
            );
        });
    }

    private removeTooltips() {
        document.querySelectorAll('.web-tools-guide-tooltip').forEach(t => {
            gsap.killTweensOf(t);
            t.remove();
        });
    }
}
