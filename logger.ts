// Shared logging utility to beam messages to the Popup's Activity Console
export type LogLevel = 'info' | 'warn' | 'error' | 'success';

/**
 * Sends a log message to the extension's internal messaging system.
 * If the popup is open, it will be rendered in the Activity Log.
 */
export const beamLog = (message: string, level: LogLevel = 'info') => {
    try {
        chrome.runtime.sendMessage({
            action: 'BEAM_LOG',
            payload: { message, level }
        });
    } catch (e) {
        // Silently ignore if the extension context is invalidated or popup is closed
    }
};
