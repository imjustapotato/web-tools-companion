/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */
import { gsap } from 'gsap';

/**
 * SHARED ANIMATION ENGINE (V2.0 PHYSICS)
 * Centralizes GSAP logic to maintain a consistent 'Obsidian' motion brand
 * across the extension and the main web application.
 */

/* PHYSICS CONFIGURATION */
const PHYSICS = {
    spring: 'elastic.out(1, 0.5)', // High-fidelity spring for badges and feedback
    bounce: 'back.out(1.5)',       // Premium overshoot for accordions and reveals
    snap: 'expo.out',              // Instant but smooth state transitions
    drop: 'power3.in'              // Weighted exit for disappearing elements
};

export const AnimEngine = {
    hasGsap: () => typeof gsap !== 'undefined',

    /**
     * Subtle scale feedback for button presses.
     */
    animatePressFeedback: (targetEl: HTMLElement | null) => {
        if (!targetEl || !AnimEngine.hasGsap()) return;
        
        gsap.killTweensOf(targetEl);
        gsap.fromTo(targetEl,
            { scale: 0.92 },
            { scale: 1, duration: 0.4, ease: PHYSICS.spring }
        );
    },

    /**
     * Binds lift and scale effects to interactive elements.
     */
    bindInteractiveHover: (element: HTMLElement | null) => {
        if (!element || !AnimEngine.hasGsap()) return;
        
        element.addEventListener('mouseenter', () => {
            gsap.killTweensOf(element);
            gsap.to(element, { scale: 1.02, y: -2, duration: 0.3, ease: PHYSICS.bounce });
        });
        
        element.addEventListener('mouseleave', () => {
            gsap.killTweensOf(element);
            gsap.to(element, { scale: 1, y: 0, duration: 0.3, ease: 'power2.out' });
        });
    },

    /**
     * Smoothly toggles accordion height with a bounce reveal.
     */
    animateAccordion: (content: HTMLElement | null, isOpen: boolean) => {
        if (!content || !AnimEngine.hasGsap()) return;
        
        gsap.killTweensOf(content);

        if (isOpen) {
            content.classList.remove('hidden');
            gsap.fromTo(content,
                { height: 0, opacity: 0, overflow: 'hidden' },
                { 
                    height: 'auto', 
                    opacity: 1, 
                    duration: 0.4, 
                    ease: PHYSICS.bounce,
                    clearProps: 'overflow' 
                }
            );
            return;
        }

        gsap.to(content, {
            height: 0,
            opacity: 0,
            overflow: 'hidden',
            duration: 0.3,
            ease: PHYSICS.drop,
            onComplete: () => content.classList.add('hidden')
        });
    },

    /**
     * Animates the 'Saved' badge with a spring entrance.
     */
    animateStatusBadge: (badge: HTMLElement | null, show: boolean) => {
        if (!badge || !AnimEngine.hasGsap()) return;

        gsap.killTweensOf(badge);

        if (show) {
            badge.classList.remove('hidden');
            gsap.set(badge, { display: 'flex' });
            gsap.fromTo(badge, 
                { scale: 0.5, opacity: 0, y: 8 },
                { scale: 1, opacity: 1, y: 0, duration: 0.5, ease: PHYSICS.spring, clearProps: "transform" }
            );
            return;
        } 
        
        gsap.to(badge, { 
            scale: 0.8, 
            opacity: 0, 
            y: -4,
            duration: 0.25, 
            ease: PHYSICS.drop,
            onComplete: () => {
                gsap.set(badge, { display: 'none' });
                badge.classList.add('hidden');
            }
        });
    },

    /**
     * Reveals the 'Smart Note' box with a drop-down bounce.
     */
    animateStatusBox: (box: HTMLElement | null, show: boolean) => {
        if (!box || !AnimEngine.hasGsap()) return;

        gsap.killTweensOf(box);

        if (show) {
            box.classList.remove('hidden');
            gsap.set(box, { display: 'block' });
            gsap.fromTo(box,
                { y: -15, opacity: 0, scale: 0.95 },
                { y: 0, opacity: 1, scale: 1, duration: 0.4, ease: PHYSICS.bounce }
            );
            return;
        } 
        
        gsap.to(box, {
            y: -10,
            opacity: 0,
            scale: 0.95,
            duration: 0.25,
            ease: PHYSICS.drop,
            onComplete: () => {
                gsap.set(box, { display: 'none' });
                box.classList.add('hidden');
            }
        });
    },
    
    /**
     * Orchestrates a modal entrance/exit with backdrop-blur and scale reveal.
     */
    animateModal: (overlay: HTMLElement | null, show: boolean) => {
        if (!overlay || !AnimEngine.hasGsap()) return;
        
        const card = overlay.querySelector('.modal-card');
        if (!card) return;

        gsap.killTweensOf([overlay, card]);

        if (show) {
            gsap.set(overlay, { display: 'flex', opacity: 0 });
            gsap.to(overlay, { opacity: 1, duration: 0.3, ease: 'power2.out' });
            
            gsap.fromTo(card,
                { scale: 0.9, opacity: 0, y: 10 },
                { scale: 1, opacity: 1, y: 0, duration: 0.4, ease: PHYSICS.bounce }
            );
        } else {
            gsap.to(overlay, { opacity: 0, duration: 0.2, ease: 'power2.in', onComplete: () => gsap.set(overlay, { display: 'none' }) });
            gsap.to(card, { scale: 0.9, opacity: 0, y: 10, duration: 0.2, ease: 'power2.in' });
        }
    },

    /**
     * Smoothly recalculates a container's height after internal layout shifts.
     * SILENT FAILURE: Exits if container is null to prevent runtime errors.
     */
    recalculateHeight: (container: HTMLElement | null) => {
        if (!container || !AnimEngine.hasGsap()) return;
        
        // Prevent GSAP fighting against collapsing animations
        if (container.classList.contains('hidden') || container.style.height === '0px' || container.style.height === '0') {
            return;
        }

        gsap.to(container, { height: 'auto', duration: 0.3, ease: 'power2.out' });
    }
};