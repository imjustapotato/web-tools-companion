# Web Tools Companion - Auto Plotter Flow

This document outlines the synchronization architecture between the **Web Tools Companion Extension**, the **FEU Tech School Portal (OSES)**, and the **Schedule Visualizer (Web Tool)**.

## Synchronization Sequence

The following diagram illustrates the lifecycle of a schedule synchronization event, from initial activation to real-time updates. OSES operates in an iframe of a different domain `oses.feutech.edu.ph`, while the Main Portal operates at `solar.feutech.edu.ph` (Cross Domain).

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant ExtPopup as Extension Popup
    participant OSES as School Portal (OSES)
    participant ScriptMain as autosched-main.ts (MAIN World)
    participant ScriptISO as autosched.ts (Isolated World)
    participant Storage as chrome.storage.local
    participant Bridge as bridge.ts (Content Script)
    participant WebApp as Schedule Visualizer (Web App)

    Note over User, ExtPopup: Activation
    User->>ExtPopup: Enable "Auto Sched"
    ExtPopup->>Storage: Set autoSchedEnabled: true

    Note over User, OSES: Initial Interception
    User->>OSES: Open Portal / Log In
    Note over OSES, ScriptMain: manifest.json injects at document_start
    ScriptMain->>OSES: Hook XHR.open / XHR.send
    OSES->>OSES: Trigger loadData.php (XHR)
    ScriptMain->>ScriptMain: Intercept XML Response
    ScriptMain->>window: postMessage(OSES_SCHEDULE_INTERCEPT)
    
    Note over ScriptISO, Storage: Processing & Refinement
    window-->>ScriptISO: Receive OSES_SCHEDULE_INTERCEPT
    ScriptISO->>Storage: Get autoSchedEnabled & latestSchedule
    Storage-->>ScriptISO: Return State
    
    alt is autoSchedEnabled
        ScriptISO->>ScriptISO: Build Preserved Room Index (from latestSchedule)
        ScriptISO->>ScriptISO: Parse XML to JSON
        ScriptISO->>ScriptISO: Correct Names (Subject Catalog)
        ScriptISO->>ScriptISO: Merge Rooms (Preservation Logic)
        ScriptISO->>ScriptISO: Track Added/Dropped Subjects
        ScriptISO->>Storage: Set latestSchedule (Updated)
        ScriptISO->>OSES: Dispatch HUB_ACTION (Auto-Sync Active)
    end

    Note over Bridge, WebApp: Handshake & Data Input
    User->>WebApp: Open Visualizer
    WebApp->>window: postMessage(WEB_TOOLS_APP_READY)
    window-->>Bridge: Receive APP_READY
    Bridge->>Storage: Get latestSchedule
    Storage-->>Bridge: Return JSON
    Bridge->>WebApp: postMessage(WEB_TOOLS_EXTENSION_SYNC)
    WebApp->>WebApp: Render Schedule

    Note over User, OSES: Real-time Update
    User->>OSES: Add/Remove Subject
    OSES->>ScriptMain: processData.php / loadData.php
    ScriptMain->>window: postMessage(OSES_SCHEDULE_INTERCEPT)
    window-->>ScriptISO: Receive Intercept
    ScriptISO->>ScriptISO: Update Storage & Notify Hub
    Bridge->>WebApp: Push Real-time Update
```

## Room Assignment Flow (SAF Preview)

The extension also supports room assignment extraction from the SAF Preview page. But `saf_preview.php` isn't intercepted as XHR therefore Room Assignment cannot be automated, it relies on the user to click the **Preview SAF** button inside OSES, the extension relies on **MutationObserver** to detect the rendered table.

**Sequence:**

```mermaid
sequenceDiagram
     autonumber
     participant User
     participant Portal as Main Portal (solar.feutech.edu.ph)
     participant SAF as SAF Preview Iframe (oses.feutech.edu.ph)
     participant ScriptISO as autosched.ts (Isolated World)
     participant Storage as chrome.storage.local
     participant Bridge as bridge.ts
     participant WebApp as Schedule Visualizer
 
     User->>Portal: Open SAF Preview
     Portal->>SAF: Load saf_preview.php (iframe)
     SAF->>ScriptISO: MutationObserver starts watching DOM
     
     alt Table .assessment_schedule appears
          ScriptISO->>ScriptISO: Parse rooms using Composite Key (Signature + Course)
          ScriptISO->>Storage: Merge rooms into latestSchedule
          ScriptISO->>SAF: Dispatch HUB_ACTION (Rooms Synced)
          Storage-->>Bridge: Notify update
          Bridge->>WebApp: Push Real-time Update
          WebApp->>WebApp: Render updated rooms
     end
```

## Key Components

### 1. The Interceptor (`autosched-main.ts`)
Injected into the **MAIN** world at `document_start`. It modifies the browser's `XMLHttpRequest` prototype to catch XML payloads before the page's own scripts can finish processing them.

### 2. The Processor (`autosched.ts`)
Resides in the **ISOLATED** world and handles the heavy lifting:
- **XML to JSON Translation:** Maps complex university XML nodes to a clean JSON schema.
- **Room Preservation:** Since XHR payloads often lack room data, the processor builds an index of previously known rooms and merges them into the new schedule based on meeting signatures.
- **Change Tracking:** Specifically identifies "Added" or "Dropped" subjects to provide informative logs.
- **Hub Integration:** Dispatches custom events to the **Portal Hub** (UI) to show "Beaming" animations and status updates.

### 3. The Bridge (`bridge.ts`)
Acts as the secure communication tunnel between the Extension's storage and the Web Tool's iframe/window.

### 4. The Visualizer
The final destination. It receives the translated JSON and renders the schedule, allowing for further manual edits and PNG exports.

# Disclaimer
While the architecture is designed to be robust against changes in the OSES portal's structure, as it relies on intercepting raw XML data rather than DOM elements. However, significant changes to the portal's API or data format may require updates to the interceptor and processor logic.