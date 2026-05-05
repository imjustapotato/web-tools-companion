/*
 * Copyright (C) 2026 Kenneth Westhle Davila (kendavila.me)
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License.
 */

// Shared logging utility to beam messages to the Popup's Activity Console
export type LogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * Sends a log message to the extension's internal messaging system.
 * If the popup is open, it will be rendered in the Activity Log.
 */
export const beamLog = (message: string, level: LogLevel = 'info') => {
    try {
        // 1. External Broadcast (Background/Popup)
        chrome.runtime.sendMessage({
            action: 'BEAM_LOG',
            payload: { message, level }
        });

        // 2. Local Broadcast (Shadow DOM Hub on same page)
        window.dispatchEvent(new CustomEvent('WEB_TOOLS_HUB_ACTION', {
            detail: {
                action: 'SHOW_LOG',
                message: message,
                logType: level
            }
        }));
    } catch (e) {
        // Silently ignore if the extension context is invalidated
    }
};
