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

export type BeamAction = 'add' | 'drop' | 'extract' | 'sync' | 'intercept';

export interface HubConfig {
    position: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
    showParticle: boolean;
    showHub: boolean;
}

export class CompanionHub {
    public shadowRoot: ShadowRoot;
    private config: HubConfig;
    
    private readonly ICONS = {
        idle: `<div class="sentry-dot"></div>`,
        active: `<div class="sentry-dot"></div>`,
        success: `<div class="sentry-dot"></div>`,
        sentry: `<div class="sentry-dot"></div>`
    };

    private container!: HTMLDivElement;
    private statusPill!: HTMLDivElement;
    private iconWrapper!: HTMLDivElement;
    private textWrapper!: HTMLDivElement;
    private statusTitleEl!: HTMLDivElement;
    private statusSubtitleEl!: HTMLDivElement;

    private isExpanded: boolean = false;
    private autoHideTimer: ReturnType<typeof setTimeout> | null = null;
    private currentState: 'idle' | 'active' | 'success' = 'idle';
    
    private messageQueue: Array<{title: string, subtitle: string, state: any}> = [];
    private isProcessingQueue: boolean = false;

    constructor(host: HTMLElement, initialConfig: HubConfig) {
        this.shadowRoot = host.attachShadow({ mode: 'open' });
        this.config = initialConfig;
        
        this.buildDOM();
        this.injectStyles();
        this.bindEvents();
        this.updateConfig(this.config);
        this.minimize(true);
    }

    private buildDOM() {
        // 1. Create a fixed layer for particles that doesn't resize with the Hub
        this.particleLayer = document.createElement('div');
        this.particleLayer.id = 'particle-layer';
        this.shadowRoot.appendChild(this.particleLayer);

        // 2. Main Hub Container
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
        
        this.statusSubtitleEl = document.createElement('div');
        this.statusSubtitleEl.className = 'status-subtitle';

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
            if (this.currentState !== 'active') this.startAutoHideTimer();
            gsap.to(this.statusPill, { y: 0, scale: 1, duration: 0.3, ease: 'power2.out' });
        });

        this.statusPill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.isExpanded) this.minimize();
            else this.expand();
        });
    }

    public updateConfig(newConfig: HubConfig) {
        this.config = newConfig;
        
        const isTop = this.config.position.includes('top');
        const isRight = this.config.position.includes('right');

        this.container.style.top = isTop ? '24px' : 'auto';
        this.container.style.bottom = !isTop ? '24px' : 'auto';
        this.container.style.left = !isRight ? '24px' : 'auto';
        this.container.style.right = isRight ? '24px' : 'auto';
        
        // Pin the dot to the outer edge
        this.container.style.alignItems = isRight ? 'flex-end' : 'flex-start';
        this.statusPill.style.flexDirection = isRight ? 'row-reverse' : 'row';
        
        // Adjust text margins based on direction
        this.textWrapper.style.marginRight = (isRight && this.isExpanded) ? '10px' : '0';
        this.textWrapper.style.marginLeft = (!isRight && this.isExpanded) ? '10px' : '0';
    }

    public update(title: string, subtitle: string, state: 'idle' | 'active' | 'success' = 'idle') {
        this.messageQueue.push({ title, subtitle, state });
        this.processQueue();
    }

    public triggerPayloadBeam(action: BeamAction = 'sync', iconSvg?: string) {
        if (!this.container || !this.config.showParticle) return;

        const ACTION_MAP: Record<BeamAction, { color: string, defaultIcon: string }> = {
            add: { color: '#10b981', defaultIcon: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v14m-7-7h14"/>` },
            drop: { color: '#ef4444', defaultIcon: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"/>` },
            extract: { color: '#3b82f6', defaultIcon: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-7l5-5l5 5m-5-5v12"/>` },
            sync: { color: '#8b5cf6', defaultIcon: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/>` },
            intercept: { color: '#f59e0b', defaultIcon: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4m4-5l5 5l5-5m-5 5V3"/>` }
        };

        const config = ACTION_MAP[action];
        const isOutbound = action !== 'intercept';

        const particle = document.createElement('div');
        particle.className = 'payload-particle';
        particle.style.setProperty('--particle-color', config.color);
        particle.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${iconSvg || config.defaultIcon}</svg>`;

        this.particleLayer.appendChild(particle);

        // Viewport-relative coordinates (Zero-drift)
        const dotRect = this.iconWrapper.getBoundingClientRect();
        const startX = dotRect.left + dotRect.width / 2;
        const startY = dotRect.top + dotRect.height / 2;

        const isBottom = this.config.position.includes('bottom');
        const screenCenterX = window.innerWidth / 2;
        
        // Target Point: Offscreen vertically
        const yDirection = isBottom ? -1 : 1;
        const endY = isBottom ? -100 : window.innerHeight + 100;
        const spreadX = screenCenterX + (Math.random() - 0.5) * 400;

        const tl = gsap.timeline({ onComplete: () => particle.remove() });

        // Randomized Center Point to avoid collisions
        const centerX = screenCenterX + (Math.random() - 0.5) * 200;

        if (isOutbound) {
            gsap.set(particle, { x: startX, y: startY, xPercent: -50, yPercent: -50, scale: 0.1, opacity: 0 });
            this.pulsePill(config.color);

            // Water Droplet Extraction (Randomized path to avoid collisions)
            tl.to(particle, {
                x: (startX + centerX) / 2,
                y: startY,
                scaleX: 1.5,
                scaleY: 0.4,
                opacity: 0.85,
                duration: 0.35,
                ease: 'power2.out'
            });

            // The Snap (Forms the physical packet at randomized center area)
            tl.to(particle, {
                x: centerX,
                y: startY,
                scaleX: 1,
                scaleY: 1,
                scale: 1,
                opacity: 1,
                duration: 0.4,
                ease: PHYSICS.spring
            }, "-=0.1");

            // The Beam Phase
            tl.to(particle, {
                x: centerX + (Math.random() - 0.5) * 400,
                y: endY,
                rotation: (Math.random() - 0.5) * 180,
                scale: 0.4,
                opacity: 0,
                duration: 0.6,
                ease: 'power3.in'
            }, "+=0.1");

            return;
        }

        // Inbound Intercept Logic: Emerging from random points in the center area
        const midX = screenCenterX + (Math.random() - 0.5) * (window.innerWidth * 0.6);
        const midY = (window.innerHeight / 2) + (Math.random() - 0.5) * (window.innerHeight * 0.6);

        gsap.set(particle, { 
            x: midX, 
            y: midY, 
            xPercent: -50, 
            yPercent: -50, 
            scale: 0.1, 
            opacity: 0,
            rotation: (Math.random() - 0.5) * 180 
        });

        // Drop to randomized center area
        tl.to(particle, {
            x: centerX,
            y: startY,
            scale: 1,
            opacity: 1,
            rotation: 0,
            duration: 0.5,
            ease: 'power3.out'
        });

        // Stretch for entry
        tl.to(particle, {
            x: (startX + centerX) / 2,
            y: startY,
            scaleX: 1.5,
            scaleY: 0.4,
            duration: 0.3,
            ease: 'power2.in'
        });

        // Absorb into Hub
        tl.to(particle, {
            x: startX,
            y: startY,
            scaleX: 0.1,
            scaleY: 0.1,
            opacity: 0,
            duration: 0.2,
            ease: 'power2.in',
            onComplete: () => this.pulsePill(config.color)
        });
    }

    private pulsePill(color: string) {
        gsap.killTweensOf(this.statusPill, "boxShadow,borderColor,scale");
        gsap.fromTo(this.statusPill, { scale: 1.05 }, { scale: 1, duration: 0.5, ease: PHYSICS.spring });
        gsap.fromTo(this.statusPill,
            { boxShadow: `0 0 40px ${color}, 0 0 0 2px ${color}`, borderColor: color },
            { 
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)', 
                borderColor: 'rgba(255, 255, 255, 0.1)', 
                duration: 1.2, 
                ease: 'power2.out',
                clearProps: 'boxShadow,borderColor'
            }
        );
    }

    private async processQueue() {
        if (this.isProcessingQueue || this.messageQueue.length === 0) return;
        this.isProcessingQueue = true;

        while (this.messageQueue.length > 0) {
            const msg = this.messageQueue.shift()!;
            await this.displayMessage(msg);
            
            const holdTime = msg.state === 'success' ? 4000 : 3000;
            await new Promise(resolve => setTimeout(resolve, holdTime));
        }

        this.isProcessingQueue = false;
        
        if (this.currentState === 'active') {
            this.displayMessage({ title: "Auto-Sync Active", subtitle: "Monitoring Portal...", state: 'active' });
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
            if (this.currentState !== 'active') this.startAutoHideTimer();
        }, 4000);
    }

    private expand(forceWipe: boolean = false) {
        if (this.isExpanded && !forceWipe) {
            if (this.currentState !== 'active') this.startAutoHideTimer();
            return;
        }
        
        this.isExpanded = true;
        this.swapIcon(this.ICONS[this.currentState] || this.ICONS.idle);

        const isRight = this.config.position.includes('right');
        const marginProp = isRight ? 'marginRight' : 'marginLeft';

        gsap.killTweensOf(this.textWrapper);
        gsap.fromTo(this.textWrapper, 
            { width: 0, opacity: 0, [marginProp]: 0, clipPath: 'inset(0 100% 0 0)' },
            {
                width: 'auto',
                opacity: 1,
                [marginProp]: 10,
                clipPath: 'inset(0 0% 0 0)',
                duration: 0.6,
                ease: forceWipe ? 'expo.out' : PHYSICS.bounce
            }
        );

        if (this.currentState !== 'active') this.startAutoHideTimer();
    }

    private minimize(immediate: boolean = false) {
        if (!this.isExpanded && !immediate) return;
        this.isExpanded = false;

        this.swapIcon(this.ICONS.sentry);

        const isRight = this.config.position.includes('right');
        const marginProp = isRight ? 'marginRight' : 'marginLeft';

        gsap.killTweensOf(this.textWrapper);
        if (immediate) {
            gsap.set(this.textWrapper, { width: 0, opacity: 0, [marginProp]: 0, clipPath: 'inset(0 100% 0 0)' });
        } else {
            gsap.to(this.textWrapper, {
                width: 0,
                opacity: 0,
                [marginProp]: 0,
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

    private injectStyles() {
        const style = document.createElement('style');
        style.textContent = `
            #companion-hub-container {
                position: fixed;
                z-index: 999999;
                pointer-events: none;
                font-family: 'Outfit', system-ui, sans-serif;
                display: flex;
                flex-direction: column;
                /* Dynamic flex alignment handled by config */
            }

            .status-pill {
                pointer-events: auto;
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
                z-index: 2;
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
                background: linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.15), transparent);
                transform: skewX(-20deg);
                animation: island-scan 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                z-index: 1;
                pointer-events: none;
            }

            #particle-layer {
                position: fixed;
                inset: 0;
                z-index: 999998;
                pointer-events: none;
            }

            .payload-particle {
                position: fixed;
                top: 0;
                left: 0;
                width: 36px;
                height: 36px;
                border-radius: 50%;
                background: rgba(15, 23, 42, 0.98);
                border: 2px solid var(--particle-color);
                color: var(--particle-color);
                display: flex;
                align-items: center;
                justify-content: center;
                pointer-events: none;
                z-index: 999999; 
                box-shadow: 0 0 20px var(--particle-color), inset 0 0 10px rgba(0,0,0,0.5);
                backdrop-filter: blur(8px);
            }

            .payload-particle svg {
                width: 18px;
                height: 18px;
                stroke-width: 2.5px;
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