(async function() {
    const urlParams = new URLSearchParams(window.location.search);
    const rawTarget = urlParams.get('page') || '/main';
    const targetPage = decodeURIComponent(rawTarget);
    
    const titleEl = document.getElementById('status-title');
    const msgEl = document.getElementById('status-msg');
    const spinner = document.getElementById('loading-spinner');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const backBtn = document.getElementById('back-btn');

    // Helper to reveal and attach back navigation logic
    function showBackButton() {
        if (!backBtn) return;
        backBtn.classList.remove('hidden');
        backBtn.onclick = () => {
            // Return to previous page if it originated from the same domain; otherwise fallback to root
            if (document.referrer && new URL(document.referrer).origin === window.location.origin) {
                window.history.back();
            } else {
                window.location.href = '/';
            }
        };
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

        // Mode A: Global Maintenance / Update Mode
        if (status.maintenanceMode) {
            titleEl.textContent = "Site Update in Progress";
            msgEl.textContent = status.maintenanceMessage || "Karaoke Wonders is currently undergoing maintenance.";
            
            if (status.maintenanceProgress !== undefined) {
                progressContainer?.classList.remove('hidden');
                progressText?.classList.remove('hidden');
                if (progressBar) progressBar.style.width = status.maintenanceProgress + '%';
                if (progressText) progressText.textContent = status.maintenanceProgress + '% Complete';
            }

            showBackButton();
            return; // Lock access
        }

        // Mode B: Target Page Maintenance Block
        const cleanTarget = targetPage.toLowerCase().replace(/^\/+|\/+$/g, '');

        const isBlocked = status.blockedPages?.some(p => {
            const cleanBlocked = p.toLowerCase().replace(/^\/+|\/+$/g, '');
            // Only block if the target page matches or lives inside a blocked directory
            return cleanBlocked.length > 0 && cleanTarget.startsWith(cleanBlocked);
        });

        if (isBlocked) {
            spinner?.classList.add('hidden');
            titleEl.textContent = "Page is under maintenance";
            msgEl.textContent = status.blockedPageMessage || "This specific section is currently down for maintenance.";

            showBackButton();
            return; // Lock access
        }

    } catch (err) {
        console.warn("Could not reach or parse status.json:", err);
        spinner?.classList.add('hidden');
        titleEl.textContent = "Connection Error";
        msgEl.textContent = "Unable to verify site status. Please refresh or try again shortly.";

        showBackButton();
        return; // STOP execution — do not bypass gate on error
    }

    // Mode C: Clear to proceed -> Redirect after buffer delay
    const elapsedTime = Date.now() - startTime;
    const remainingDelay = Math.max(0, MIN_BUFFER_MS - elapsedTime);

    setTimeout(() => {
        const redirectUrl = new URL(targetPage, window.location.origin);
        redirectUrl.searchParams.set('skip_loader', 'true');
        window.location.replace(redirectUrl.toString());
    }, remainingDelay);
})();