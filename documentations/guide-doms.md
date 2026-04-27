# Companion Hub & Guidance System

The Companion Hub is a premium UI overlay injected into the SOLAR Portal. It provides real-time status updates, visual feedback for data extraction (beams), and an interactive guidance system that helps users navigate the portal.

## Technical Architecture

To ensure zero style leakage and maintain isolation from the portal's aging CSS, the hub is built using **Shadow DOM**.

### Component Hierarchy
- **`#web-tools-companion-hub-host`**: The root div injected into the portal's `<body>`.
  - **`ShadowRoot`**: Provides encapsulation.
    - **`#companion-hub-container`**: The main flex wrapper for the UI.
      - **`status-dom.ts` (The Pill)**: The "Dynamic Island" status bar.
      - **`logger-dom.ts` (Toast Stack)**: Aggregated notifications.
    - **`#particle-layer`**: A fixed-position overlay for GSAP particle animations.

> [!NOTE]
> `guide-dom.ts` (Highlighter & Tooltips) is injected into the **main document** instead of the Shadow DOM. This allows it to target and overlay portal elements directly without being clipped by the hub's container boundaries.

---

## Communication Layer

The orchestrator (`portal-guide.ts`) acts as a central relay, listening for events from two sources:

### 1. Chrome Runtime Messages
Used by the **Extension Popup** and **Background Workers** to update the hub state or trigger highlights.
```typescript
chrome.runtime.sendMessage({ 
    action: 'UPDATE_HUB_STATUS', 
    title: 'Syncing...',
    subtitle: 'Monitoring Portal...', // subtitle is also supported
    state: 'active' 
});
```

### 2. Custom Window Events
Used by **Content Scripts** (like `saf-scraper.ts`) that may not have direct access to `chrome.runtime` or need a low-latency trigger.
```typescript
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
}));
```

---

## Guidance & Snark System

The guidance system is a persistent state machine stored in `chrome.storage.local`. It guides users to specific pages (like SAF or Curriculum) and handles user "stubbornness" through escalating snark.

### The "Good Boy/Girl" Reward System
If a user ignores instructions (e.g., fails to navigate to the correct page), the `count` increments, and the messages become increasingly snarky. 

If the user eventually follows the instruction after the count is `> 1`, the system triggers a **Reward Celebration**:
1.  **Hub Update**: Displays "Nice Work!" and "Who's a Good Boy/Girl?".
2.  **Logger Update**: Logs a supportive message with hearts.
3.  **Heart Burst**: Triggers a shower of ❤️ particles via the beam engine.

---

## GSAP Animation Engine

The hub uses **GSAP** for high-performance, physics-based animations.

### 1. The "Dynamic Island" Pill
The pill uses an `elastic` easing to feel bouncy and reactive during expansion/minimization.
- **Physics**: `elastic.out` for expansion, `expo.out` for snapping closed.
- **Icon Swapping**: Icons rotate and scale slightly when state changes.

### 2. Particle Beam Engine
Visualizes data flow between the Portal and the Web Tool.
- **Outbound (Extract)**: Particles "squish" out of the hub, snap into shape at a midpoint, then beam offscreen.
- **Inbound (Intercept)**: Particles materialize from random viewport points and are "absorbed" into the hub.
- **Heart Burst**: Uses the same outbound logic but with randomized arc trajectories toward the top of the screen.

---

# Integration Guide

### The Extension uses Atomic Design Principles in order to have better reusability across this Extension.

---

### Triggering a Data Beam
To show that data is being sent or received, fire a `FIRE_PAYLOAD_BEAM` action.

```typescript
// Outbound (Extracting data)
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' }
}));

// Inbound (Intercepting data)
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { action: 'FIRE_PAYLOAD_BEAM', payloadType: 'intercept' }
}));
```

### Triggering a Guide Highlight
Use this to point the user toward a specific button or input.

```typescript
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { 
        action: 'HIGHLIGHT_ELEMENT', 
        selector: '#submit-button', 
        message: "Click here to proceed!",
        position: 'top' // or 'bottom'
    }
}));
```

### Manual Logging
To push a message into the hub's toast stack:
```typescript
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { 
        action: 'SHOW_LOG', 
        message: "Data synced successfully!", 
        logType: 'success' // 'success', 'warn', 'error', 'info'
    }
}));
```

### Triggering the Beaming Animation
Shows a pulsing glow on the pill for ~4 seconds. Use this when a background transfer is in progress.
```typescript
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { action: 'SHOW_BEAMING' }
}));
```

### Clearing All Guide Highlights
Removes all active element highlights and tooltips immediately. Useful after a flow completes or on navigation.
```typescript
window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
    detail: { action: 'CLEAR_GUIDE' }
}));
```
