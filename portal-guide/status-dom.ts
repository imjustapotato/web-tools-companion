/**
 * Status Hub (Shadow DOM Component)
 * Handles the "Dynamic Island" UI with GSAP Physics and Sentry Mode.
 */
import { gsap } from 'gsap';

// V2.0 Physics configuration
const PHYSICS = {
    spring: 'elastic.out(1, 0.6)',
    bounce: 'back.out(1.5)',
    snap: 'expo.out'
};

export class CompanionHub {
    // --- Global / Configuration ---
    public shadowRoot: ShadowRoot;
    
    private readonly ICONS = {
        idle: `<div class="sentry-dot"></div>`,
        active: `<div class="sentry-dot"></div>`,
        success: `<div class="sentry-dot"></div>`,
        sentry: `<div class="sentry-dot"></div>`
    };

    // --- DOM References ---
    private container!: HTMLDivElement;
    private statusPill!: HTMLDivElement;
    private iconWrapper!: HTMLDivElement;
    private textWrapper!: HTMLDivElement;
    private statusTitleEl!: HTMLDivElement;
    private statusSubtitleEl!: HTMLDivElement;

    // --- State & Timers ---
    private isExpanded: boolean = false;
    private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
    private currentState: 'idle' | 'active' | 'success' = 'idle';
    
    // Queue System
    private messageQueue: Array<{title: string, subtitle: string, state: any}> = [];
    private isProcessingQueue: boolean = false;

    constructor(host: HTMLElement) {
        this.shadowRoot = host.attachShadow({ mode: 'open' });
        
        this.buildDOM();
        this.injectStyles();
        this.bindEvents();

        // Default to Sentry mode
        this.minimize(true);
    }

    // --- Core Architecture Methods ---

    private buildDOM() {
        this.container = document.createElement('div');
        this.container.id = 'companion-hub-container';
        
        this.statusPill = document.createElement('div');
        this.statusPill.className = 'status-pill status-idle';
        
        this.iconWrapper = document.createElement('div');
        this.iconWrapper.className = 'icon-wrapper';
        this.iconWrapper.innerHTML = this.ICONS.idle;

        this.textWrapper = document.createElement('div');
        this.textWrapper.className = 'text-wrapper';
        
        this.statusTitleEl = document.createElement('div');
        this.statusTitleEl.className = 'status-title';
        this.statusTitleEl.textContent = 'Auto-Sync Active';

        this.statusSubtitleEl = document.createElement('div');
        this.statusSubtitleEl.className = 'status-subtitle';
        this.statusSubtitleEl.textContent = 'Monitoring Portal...';

        this.textWrapper.appendChild(this.statusTitleEl);
        this.textWrapper.appendChild(this.statusSubtitleEl);
        
        this.statusPill.appendChild(this.iconWrapper);
        this.statusPill.appendChild(this.textWrapper);
        this.container.appendChild(this.statusPill);
        this.shadowRoot.appendChild(this.container);
    }

    private bindEvents() {
        this.statusPill.addEventListener('mouseenter', () => {
            this.expand();
            gsap.to(this.statusPill, { y: -2, scale: 1.02, duration: 0.3, ease: PHYSICS.bounce });
        });

        this.statusPill.addEventListener('mouseleave', () => {
            if (this.currentState !== 'active') {
                this.startAutoHideTimer();
            }
            gsap.to(this.statusPill, { y: 0, scale: 1, duration: 0.3, ease: 'power2.out' });
        });

        this.statusPill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isExpanded) {
                this.minimize();
            } else {
                this.expand();
            }
        });
    }

    // --- Public API ---

    public update(title: string, subtitle: string, state: 'idle' | 'active' | 'success' = 'idle') {
        // High priority: success and active states enter the queue
        this.messageQueue.push({ title, subtitle, state });
        this.processQueue();
    }

    private async processQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()!;
            await this.displayMessage(msg);
            
            // Hold success messages longer
            const holdTime = msg.state === 'success' ? 4000 : 3000;
            await new Promise(resolve => setTimeout(resolve, holdTime));
        }

        this.isProcessingQueue = false;
        
        // Return to persistent state if active mode is still on
        if (this.currentState === 'active') {
            this.displayMessage({ 
                title: "Auto-Sync Active", 
                subtitle: "Monitoring Portal...", 
                state: 'active' 
            });
        }
    }

    private async displayMessage(msg: {title: string, subtitle: string, state: any}) {
        const isNewState = this.currentState !== msg.state;
        const isNewContent = (msg.title && this.statusTitleEl.textContent !== msg.title) || 
                            (msg.subtitle && this.statusSubtitleEl.textContent !== msg.subtitle);
        
        this.currentState = msg.state;

        if (this.isExpanded && isNewContent) {
            this.animateTextSwap(msg.title, msg.subtitle);
        } else {
            if (msg.title) this.statusTitleEl.textContent = msg.title;
            if (msg.subtitle) this.statusSubtitleEl.textContent = msg.subtitle;
        }

        // Apply state styles
        this.statusPill.className = `status-pill status-${msg.state}`;
        this.swapIcon(this.ICONS[msg.state] || this.ICONS.idle);

        if (msg.state === 'active') {
            if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
            if (!this.isExpanded) this.expand(isNewState);
        } else {
            if (!this.isExpanded) this.expand();
            this.startAutoHideTimer();
        }
    }

    private animateTextSwap(title: string, subtitle: string) {
        gsap.to(this.textWrapper, {
            opacity: 0,
            x: -10,
            duration: 0.2,
            ease: 'power2.in',
            onComplete: () => {
                if (title) this.statusTitleEl.textContent = title;
                if (subtitle) this.statusSubtitleEl.textContent = subtitle;
                gsap.fromTo(this.textWrapper, 
                    { opacity: 0, x: 10 },
                    { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
                );
            }
        });
    }

    public showBeaming() {
        this.expand();
        this.statusPill.classList.add('beaming');
        setTimeout(() => {
            this.statusPill.classList.remove('beaming');
            if (this.currentState !== 'active') {
                this.startAutoHideTimer();
            }
        }, 4000);
    }

    // --- Animation & State Logic ---

    private expand(forceWipe: boolean = false) {
        if (this.isExpanded && !forceWipe) {
            if (this.currentState !== 'active') this.startAutoHideTimer();
            return;
        }
        
        this.isExpanded = true;
        this.swapIcon(this.ICONS[this.currentState] || this.ICONS.idle);

        gsap.killTweensOf(this.textWrapper);
        
        gsap.fromTo(this.textWrapper, 
            { 
                width: 0, 
                opacity: 0, 
                marginLeft: 0,
                clipPath: 'inset(0 100% 0 0)' 
            },
            {
                width: 'auto',
                opacity: 1,
                marginLeft: 10,
                clipPath: 'inset(0 0% 0 0)',
                duration: 0.6,
                ease: forceWipe ? 'expo.out' : PHYSICS.bounce
            }
        );

        if (this.currentState !== 'active') {
            this.startAutoHideTimer();
        }
    }

    private minimize(immediate: boolean = false) {
        if (!this.isExpanded && !immediate) return;
        this.isExpanded = false;

        this.swapIcon(this.ICONS.sentry);

        gsap.killTweensOf(this.textWrapper);
        if (immediate) {
            gsap.set(this.textWrapper, { width: 0, opacity: 0, marginLeft: 0, clipPath: 'inset(0 100% 0 0)' });
        } else {
            gsap.to(this.textWrapper, {
                width: 0,
                opacity: 0,
                marginLeft: 0,
                clipPath: 'inset(0 100% 0 0)',
                duration: 0.4,
                ease: PHYSICS.snap
            });
        }
    }

    private swapIcon(newSvg: string) {
        if (this.iconWrapper.innerHTML === newSvg) return;
        
        this.iconWrapper.innerHTML = newSvg;
        gsap.fromTo(this.iconWrapper, 
            { scale: 0.5, rotation: -15 }, 
            { scale: 1, rotation: 0, duration: 0.5, ease: PHYSICS.spring }
        );
    }

    private startAutoHideTimer() {
        if (this.autoHideTimer) clearTimeout(this.autoHideTimer);
        if (this.currentState === 'active') return;
        this.autoHideTimer = setTimeout(() => this.minimize(), 5000);
    }

    // --- Styles ---

    private injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #companion-hub-container {
                position: fixed;
                bottom: 24px;
                left: 24px;
                z-index: 999999;
                pointer-events: auto;
                font-family: 'Outfit', system-ui, sans-serif;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
            }

            .status-pill {
                box-sizing: border-box;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                height: 44px;
                padding: 0 12px;
                background: rgba(15, 23, 42, 0.85);
                backdrop-filter: blur(16px) saturate(180%);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 22px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                cursor: pointer;
                user-select: none;
                overflow: hidden;
                position: relative;
            }

            .icon-wrapper {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 20px;
                height: 20px;
                flex-shrink: 0;
                color: #94a3b8;
            }

            .text-wrapper {
                display: flex;
                flex-direction: column;
                justify-content: center;
                overflow: hidden;
                white-space: nowrap;
                width: 0;
                opacity: 0;
                margin-left: 0;
            }

            .sentry-dot {
                width: 8px;
                height: 8px;
                background: #3b82f6;
                border-radius: 50%;
                position: relative;
                box-shadow: 0 0 10px rgba(59, 130, 246, 0.8);
            }

            .sentry-dot::after, .sentry-dot::before {
                content: '';
                position: absolute;
                inset: -4px;
                border-radius: 50%;
                background: inherit;
                opacity: 0.4;
                animation: double-radar-pulse 2.5s ease-out infinite;
            }

            .sentry-dot::before {
                animation-delay: 1.25s;
            }

            .status-active .sentry-dot::after, 
            .status-active .sentry-dot::before {
                animation-duration: 1.5s;
            }

            .status-active .sentry-dot::before {
                animation-delay: 0.75s;
            }

            .status-active::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 50%;
                height: 100%;
                background: linear-gradient(
                    90deg, 
                    transparent, 
                    rgba(59, 130, 246, 0.15), 
                    transparent
                );
                transform: skewX(-20deg);
                animation: island-scan 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                z-index: 1;
                pointer-events: none;
            }

            @keyframes island-scan {
                0% { left: -100%; }
                100% { left: 200%; }
            }

            @keyframes double-radar-pulse {
                0% { transform: scale(1); opacity: 0.8; }
                100% { transform: scale(3.5); opacity: 0; }
            }

            .status-title {
                font-size: 13px;
                font-weight: 600;
                color: #f8fafc;
                line-height: 1.2;
            }

            .status-subtitle {
                font-size: 10px;
                color: #64748b;
                line-height: 1.2;
            }

            .status-active .icon-wrapper { color: #3b82f6; }
            .status-active .status-subtitle { color: #60a5fa; }
            .status-success .icon-wrapper { color: #10b981; }
            .status-success .status-subtitle { color: #34d399; }

            .beaming {
                animation: beaming-glow 1s infinite alternate;
            }

            @keyframes beaming-glow {
                from { border-color: rgba(59, 130, 246, 0.3); box-shadow: 0 0 10px rgba(59, 130, 246, 0.2); }
                to { border-color: #3b82f6; box-shadow: 0 0 20px rgba(59, 130, 246, 0.4); }
            }
        `;
        this.shadowRoot.appendChild(style);
    }
}