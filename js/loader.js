        (async function() {
            const urlParams = new URLSearchParams(window.location.search);
            const targetPage = urlParams.get('page') || '/main';
            
            const titleEl = document.getElementById('status-title');
            const msgEl = document.getElementById('status-msg');
            const spinner = document.getElementById('loading-spinner');
            const progressContainer = document.getElementById('progress-container');
            const progressBar = document.getElementById('progress-bar');
            const progressText = document.getElementById('progress-text');

            const MIN_BUFFER_MS = 600; // Buffer time for low-end devices/styling
            const startTime = Date.now();

            try {
                // Fetch central status config
                const res = await fetch('/files/status.json?t=' + Date.now(), { cache: 'no-store' });
                
                if (res.ok) {
                    const status = await res.json();

                    // Mode A: Global Maintenance / Update Mode
                    if (status.maintenanceMode) {
                        titleEl.textContent = "Site Update in Progress";
                        msgEl.textContent = status.maintenanceMessage || "Karaoke Wonders is currently undergoing maintenance.";
                        
                        if (status.maintenanceProgress !== undefined) {
                            progressContainer.classList.remove('hidden');
                            progressText.classList.remove('hidden');
                            progressBar.style.width = status.maintenanceProgress + '%';
                            progressText.textContent = status.maintenanceProgress + '% Complete';
                        }
                        return; // Keep user locked on this dedicated loading screen
                    }

                    // Mode B: Target Page Maintenance Block
                    const isBlocked = status.blockedPages?.some(p => targetPage.toLowerCase().startsWith(p.toLowerCase()));
                    if (isBlocked) {
                        spinner.classList.add('hidden');
                        titleEl.textContent = "Page Temporarily Unavailable";
                        msgEl.textContent = status.blockedPageMessage || "This specific section is currently down for maintenance.";
                        return; // Lock access to target page
                    }
                }
            } catch (err) {
                console.warn("Could not reach status.json, attempting redirection anyway.", err);
            }

            // Mode C: Clear to proceed -> Redirect to requested page after buffer delay
            const elapsedTime = Date.now() - startTime;
            const remainingDelay = Math.max(0, MIN_BUFFER_MS - elapsedTime);

            setTimeout(() => {
                // Pass skip_loader flag to avoid redirect loops
                const redirectUrl = new URL(targetPage, window.location.origin);
                redirectUrl.searchParams.set('skip_loader', 'true');
                window.location.replace(redirectUrl.toString());
            }, remainingDelay);
        })();