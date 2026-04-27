# Messaging Bridge

The Bridge is the communication backbone that connects the **Web Tools Companion Extension** to the **Web Tools Web Application**. Since the extension and the web app live in different execution contexts, the bridge uses `window.postMessage` to relay data securely across the boundary.

## The Handshake (Ping-Pong)

To ensure the extension and the web app are synchronized, a "Ping-Pong" sensing mechanism is used.

### 1. Connection Sensing
- **`WEB_TOOLS_APP_READY`**: Fired by the Web App when it finishes loading. The extension listens for this and immediately triggers a `syncAllDataToApp()`.
- **`WEB_TOOLS_REQUEST_SYNC`**: Fired by the Web App if it needs to force a fresh data pull from the extension.

### 2. Heartbeat System
- **`WEB_TOOLS_HEARTBEAT_REQUEST`**: Fired once by the Web App on init alongside `WEB_TOOLS_APP_READY`. If no `WEB_TOOLS_HEARTBEAT_RESPONSE` arrives within **2 seconds**, the status pill flips to `not-installed`.
- **`WEB_TOOLS_HEARTBEAT_RESPONSE`**: The extension responds with `{ installed, autoSchedEnabled, isPortalOpen }` — enough for the pill to determine whether to show `primed` or `auto` state.

---

## Data Payloads

The bridge categorizes data into three main types to handle persistence and delivery differently.

| DataType | Type | Description |
|---|---|---|
| **`SAF`** | Persistent | The auto-synced schedule from the background worker. Pushed on every update. |
| **`SAF_EXTRACT`** | Ephemeral | Manually scraped SAF data from the content script. Cleared after ACK. The visualizer detects this via `dataType === 'SAF_EXTRACT'` **or** `payload.source === 'manual-saf'`. |
| **`CURRICULUM`** | Ephemeral | Program curriculum data scraped from the portal. Cleared after ACK. |

---

## The ACK System (Delivery Assurance)

To prevent data loss and ensure a "clean" handover of ephemeral data, the bridge implements an **Acknowledgment (ACK) Handshake**.

### The Handshake Flow:
1.  **Push**: The extension pushes an ephemeral payload (e.g., `CURRICULUM`) to the web app via `WEB_TOOLS_EXTENSION_SYNC`.
2.  **Receive**: The Web App receives the data and parses it.
3.  **Acknowledge**: The Web App fires a `WEB_TOOLS_SYNC_ACK` message back to the window.
4.  **Cleanup**: The bridge listens for this ACK and performs a **Storage Cleanup**:
    -   It removes the corresponding key (`latestCurriculum`, `extractedSchedule`) from `chrome.storage.local`.
    -   This prevents the app from receiving the same "old" extraction data on the next page refresh.

> [!TIP]
> **Smart Cleanup**: For the `SAF` (Persistent) data, the bridge only clears the storage upon ACK if **Auto-Sync** is disabled. This ensures that the schedule is only "forgotten" when the user explicitly stops monitoring.

---

## Real-Time Synchronization

Beyond the initial handshake, the bridge monitors `chrome.storage.onChanged`. Any update to the schedule or curriculum in the extension's local storage is immediately pushed to the Web App in real-time. This allows the user to click "Extract" on the Portal and see the data appear instantly in the Visualizer without refreshing the page.
