// This script is injected into the MAIN world of the page to bypass CSP restrictions on inline scripts.
(function() {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
        let requestAction = "";
        try {
            const body = arguments[0];
            if (typeof body === 'string') {
                const match = body.match(/action=([^&]+)/);
                if (match) requestAction = match[1];
            } else if (body instanceof URLSearchParams || body instanceof FormData) {
                requestAction = body.get('action') as string;
            }
        } catch(e) {}

        this.addEventListener('load', function() {
            const responseText = this.responseText || "";
            // Verify payload signature before passing it back
            if (typeof responseText === 'string' && responseText.includes('<course_enrolled>')) {
                window.postMessage({ 
                    type: 'OSES_SCHEDULE_INTERCEPT', 
                    data: responseText,
                    action: requestAction,
                    url: this._url
                }, '*');
            }
        });
        
        return originalSend.apply(this, arguments);
    };
})();
