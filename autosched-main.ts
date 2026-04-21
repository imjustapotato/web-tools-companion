// This script is injected into the MAIN world of the page to bypass CSP restrictions on inline scripts.
(function () {
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
        this: XMLHttpRequest & { _url?: string },
        method: string,
        url: string | URL,
        async: boolean = true,
        username?: string | null,
        password?: string | null
    ) {
        this._url = url as string;
        return originalOpen.call(this, method, url, async, username, password);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (this: XMLHttpRequest & { _url?: string }, ...args: Parameters<typeof originalSend>) {
        let requestAction = "";
        try {
            const body = args[0];
            if (typeof body === 'string') {
                const match = body.match(/action=([^&]+)/);
                if (match) requestAction = match[1];
            } else if (body instanceof URLSearchParams || body instanceof FormData) {
                requestAction = body.get('action') as string;
            }
        } catch (e) { }

        this.addEventListener('load', function (this: XMLHttpRequest & { _url?: string }) {
            const responseText = this.responseText || "";
            if (typeof responseText === 'string') {
                // Trap 1: The standard Enrollment XML sync
                if (responseText.includes('<course_enrolled>')) {
                    window.postMessage({
                        type: 'OSES_SCHEDULE_INTERCEPT',
                        data: responseText,
                        action: requestAction,
                        url: this._url
                    }, '*');
                }
                // If more traps are needed in the future, append here.
            }
        });

        return originalSend.apply(this, args);
    };
})();