// Usage: Outbound beam — data extracted from portal and pushed to web app
chrome.runtime.sendMessage({ action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' });

// Usage: Inbound beam — data intercepted from a portal response
chrome.runtime.sendMessage({ action: 'FIRE_PAYLOAD_BEAM', payloadType: 'intercept' });