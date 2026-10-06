// external-link-interceptor.js
document.addEventListener('click', function (event) {
    // 1. Find nearest <a> tag from the click target
    const linkNode = event.target.closest('a');
    if (!linkNode || !linkNode.href) return;

    try {
        const targetUrl = new URL(linkNode.href, window.location.href);

        // 2. Ignore non-HTTP/HTTPS protocols (e.g., mailto:, tel:, javascript:, # anchors)
        if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
            return;
        }

        // 3. Define allowed internal hostnames and trusted domains
        const allowedHosts = [
            window.location.hostname,
            'karaokewonders.com'
        ];

        // 4. Check if the link belongs to an allowed host
        const isInternalLink = allowedHosts.some(host => 
            targetUrl.hostname === host || targetUrl.hostname.endsWith('.' + host)
        );

        // 5. Intercept external links and route to warning page
        if (!isInternalLink) {
            event.preventDefault();
            
            // Redirect to your custom warning page passing target link as a query param
            const warningPage = '/external.html';
            const redirectUrl = `${warningPage}?target=${encodeURIComponent(targetUrl.href)}`;
            
            // Open in new tab or same tab based on original link target
            if (linkNode.target === '_blank') {
                window.open(redirectUrl, '_blank', 'noopener,noreferrer');
            } else {
                window.location.href = redirectUrl;
            }
        }
    } catch (err) {
        // Fallback for invalid URLs
        console.error('Error parsing link URL:', err);
    }
}, true);