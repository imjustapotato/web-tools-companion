// Outbound (e.g. "We grabbed your schedule and pushed it to the web app")
chrome.runtime.sendMessage({ action: 'FIRE_PAYLOAD_BEAM', payloadType: 'extract' });

// Inbound (e.g. "We intercepted a response from a website")
chrome.runtime.sendMessage({ action: 'FIRE_PAYLOAD_BEAM', payloadType: 'intercept' });