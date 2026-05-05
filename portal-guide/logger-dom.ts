/**
 * Logger Hub (Shadow DOM Component)
 */
import { gsap } from 'gsap';
import { setSafeHTML } from '../src/utils/dom';

interface ActiveToast {
    element: HTMLDivElement;
    count: number;
    timer: any;
    message: string;
}

export class LoggerHub {
    private container: HTMLDivElement;
    private activeToasts: Map<string, ActiveToast> = new Map();

    /* Toast Icon SVGs */
    private readonly ICONS = {
        success: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="#10b981" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="m7 12.5l3 3l7-7"/><circle cx="12" cy="12" r="9"/></g></svg>`,
        warn: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="#f59e0b" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 9v4m0 4h.01M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18"/></g></svg>`,
        error: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="#ef4444" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0M15 9l-6 6M9 9l6 6"/></g></svg>`,
        info: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><g fill="none" stroke="#3b82f6" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M12 11v5m0-8h.01M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18"/></g></svg>`
    };

    constructor(parent: HTMLElement | ShadowRoot) {
        this.container = document.createElement('div');
        this.container.id = 'logger-hub-notifications';
        this.applyStyles();
        
        if (parent instanceof ShadowRoot || parent.id === 'companion-hub-container') {
            parent.prepend(this.container);
        } else {
            parent.appendChild(this.container);
        }
    }

    public log(message: string, type: 'success' | 'warn' | 'error' | 'info' = 'info') {
        const toastId = `${type}:${message}`;
        const existingToast = this.activeToasts.get(toastId);

        if (existingToast) {
            this.updateExistingToast(existingToast, toastId);
        } else {
            this.createNewToast(message, type, toastId);
        }
    }

    private createNewToast(message: string, type: string, toastId: string) {
        const toast = document.createElement('div');
        toast.className = `log-toast log-${type}`;
        
        const iconHtml = (this.ICONS as any)[type] || this.ICONS.info;
        
        setSafeHTML(toast, `
            <span class="log-icon">${iconHtml}</span>
            <div class="log-content">
                <span class="log-message">${message}</span>
                <span class="log-count"></span>
            </div>
        `);

        this.container.appendChild(toast);

        const activeToast: ActiveToast = {
            element: toast,
            count: 1,
            message: message,
            timer: this.startRemovalTimer(toastId)
        };

        this.activeToasts.set(toastId, activeToast);

        /* Entrance Animation */
        gsap.fromTo(toast, 
            { opacity: 0, x: -30, scale: 0.9 },
            { opacity: 1, x: 0, scale: 1, duration: 0.4, ease: 'back.out(1.5)' }
        );
    }

    private updateExistingToast(toast: ActiveToast, toastId: string) {
        toast.count++;
        
        const countEl = toast.element.querySelector('.log-count') as HTMLElement;
        if (countEl) {
            countEl.textContent = `(x${toast.count})`;
            countEl.classList.add('visible');
        }

        // Tactile bump so the user notices the count increment
        gsap.fromTo(toast.element, 
            { scale: 1 }, 
            { scale: 1.05, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.out' }
        );

        // Reset auto-dismiss so aggregated toasts stay visible longer
        clearTimeout(toast.timer);
        toast.timer = this.startRemovalTimer(toastId);
    }

    private startRemovalTimer(toastId: string) {
        return setTimeout(() => {
            const toast = this.activeToasts.get(toastId);
            if (!toast) return;

            this.activeToasts.delete(toastId);
            
            gsap.to(toast.element, {
                opacity: 0,
                x: -40,
                scale: 0.9,
                duration: 0.4,
                ease: 'power2.in',
                onComplete: () => toast.element.remove()
            });
        }, 5000);
    }

    private applyStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #logger-hub-notifications {
                display: flex;
                flex-direction: column-reverse;
                gap: 8px;
                width: 320px;
                pointer-events: none;
                margin-bottom: 12px;
                z-index: 1000000;
            }

            .log-toast {
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 10px 14px;
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(16px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-left: 3px solid #3b82f6;
                border-radius: 6px 16px 16px 6px;
                color: #f1f5f9;
                font-size: 12px;
                font-family: 'Outfit', system-ui, sans-serif;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                pointer-events: auto;
                transform-origin: left center;
            }

            .log-success { border-left-color: #10b981; }
            .log-warn { border-left-color: #f59e0b; }
            .log-error { border-left-color: #ef4444; }

            .log-icon { 
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
            }

            .log-content {
                display: flex;
                align-items: center;
                gap: 6px;
                line-height: 1.4;
                font-weight: 500;
            }

            .log-count {
                font-size: 10px;
                font-weight: 700;
                color: #94a3b8;
                opacity: 0;
                transform: scale(0.8);
                transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
            }

            .log-count.visible {
                opacity: 1;
                transform: scale(1);
                color: inherit;
            }
        `;
        this.container.appendChild(style);
    }
}
