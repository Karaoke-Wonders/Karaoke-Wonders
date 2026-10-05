(async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const rawTarget = urlParams.get('page') || '/main';
    const targetPage = decodeURIComponent(rawTarget);
    
    // Core Elements
    const titleEl = document.getElementById('status-title');
    const msgEl = document.getElementById('status-msg');
    const spinner = document.getElementById('loading-spinner');
    
    // Maintenance Section Elements
    const maintenanceDetails = document.getElementById('maintenance-details');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    
    // Footer Action Elements
    const footerActions = document.getElementById('footer-actions');
    const backBtn = document.getElementById('back-btn');
    const communityBtn = document.getElementById('community-btn');

    // Helper function to reveal maintenance/error controls when navigation is halted
    function showHaltUI(status) {
        // Hide primary top spinner
        spinner?.classList.add('hidden');

        // Reveal the main footer actions container
        footerActions?.classList.remove('hidden');

        // Reveal Discord/Community link button
        communityBtn?.classList.remove('hidden');

        // Handle safe Back button display and action
        if (backBtn) {
            const hasSameOriginReferrer = document.referrer && new URL(document.referrer).origin === window.location.origin;

            if (hasSameOriginReferrer) {
                backBtn.classList.remove('hidden');
                backBtn.onclick = () => window.history.back();
            } else {
                const cleanRoot = 'main';
                const isRootBlocked = status?.maintenanceMode || status?.blockedPages?.some(p => {
                    const clean = p.toLowerCase().replace(/^\/+|\/+$/g, '');
                    return clean === '' || clean === cleanRoot;
                });

                if (!isRootBlocked) {
                    backBtn.classList.remove('hidden');
                    backBtn.onclick = () => window.location.href = '/';
                }
            }
        }
    }

    const MIN_BUFFER_MS = 600;
    const startTime = Date.now();

    try {
        // Fetch central status config directly using origin to prevent base tag interference
        const statusUrl = new URL('/files/status.json', window.location.origin);
        statusUrl.searchParams.set('t', Date.now().toString());

        const res = await fetch(statusUrl.toString(), { cache: 'no-store' });
        
        if (!res.ok) {
            throw new Error(`status.json returned HTTP status ${res.status}`);
        }

        const status = await res.json();

        // Mode A: Global Maintenance / Update Mode Enabled
        if (status.maintenanceMode) {
            titleEl.textContent = "System Maintenance in Progress";
            msgEl.textContent = status.maintenanceMessage || "Karaoke Wonders is currently undergoing scheduled updates.";
            
            // Reveal the detailed maintenance checklist breakdown section
            maintenanceDetails?.classList.remove('hidden');

            if (status.maintenanceProgress !== undefined) {
                if (progressBar) progressBar.style.width = status.maintenanceProgress + '%';
                if (progressText) progressText.textContent = status.maintenanceProgress + '% Complete';
            }

            showHaltUI(status);
            return; // Lock access
        }

        // Mode B: Target Page Maintenance Block
        const cleanTarget = targetPage.toLowerCase().replace(/^\/+|\/+$/g, '');

        const isBlocked = status.blockedPages?.some(p => {
            const cleanBlocked = p.toLowerCase().replace(/^\/+|\/+$/g, '');
            // Only block if target page matches or lives inside a blocked directory
            return cleanBlocked.length > 0 && cleanTarget.startsWith(cleanBlocked);
        });

        if (isBlocked) {
            titleEl.textContent = "Page Temporarily Unavailable";
            msgEl.textContent = status.blockedPageMessage || "This specific section is currently down for maintenance.";

            // Reveal breakdown and action buttons
            maintenanceDetails?.classList.remove('hidden');

            showHaltUI(status);
            return; // Lock access
        }

    } catch (err) {
        console.warn("Could not reach or parse status.json:", err);
        titleEl.textContent = "Connection Error";
        msgEl.textContent = "Unable to verify site status. Please try again shortly.";

        showHaltUI(null);
        return; // STOP execution — do not bypass gate on error
    }

    // Mode C: Clear to proceed -> Fast redirect after buffer delay (keeps normal loading clean)
    const elapsedTime = Date.now() - startTime;
    const remainingDelay = Math.max(0, MIN_BUFFER_MS - elapsedTime);

    setTimeout(() => {
        const redirectUrl = new URL(targetPage, window.location.origin);
        redirectUrl.searchParams.set('skip_loader', 'true');
        window.location.replace(redirectUrl.toString());
    }, remainingDelay);
})();