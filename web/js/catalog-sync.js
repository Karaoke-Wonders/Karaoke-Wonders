(() => {
    const POLL_INTERVAL_MS = 10000;
    const MIN_SYNC_GAP_MS = 2000;
    let catalogVersion = null;
    let checkInFlight = false;
    let lastCheckAt = 0;

    function setCatalogVersion(version) {
        if (typeof version !== 'string' || !version) return;
        if (catalogVersion === null) {
            catalogVersion = version;
            return;
        }
        if (catalogVersion === version) return;

        catalogVersion = version;
        window.dispatchEvent(new CustomEvent('kw-song-catalog-updated', { detail: { version } }));
    }

    window.setSongCatalogVersion = setCatalogVersion;

    async function checkCatalogVersion() {
        if (checkInFlight || document.visibilityState === 'hidden') return;
        if (Date.now() - lastCheckAt < MIN_SYNC_GAP_MS) return;

        checkInFlight = true;
        lastCheckAt = Date.now();
        try {
            const response = await fetch('/api/songs/version', { cache: 'no-store' });
            if (!response.ok) return;
            const data = await response.json();
            setCatalogVersion(data.version);
        } catch (error) {
            console.warn('[CatalogSync] Could not check catalog version:', error.message);
        } finally {
            checkInFlight = false;
        }
    }

    window.addEventListener('focus', checkCatalogVersion);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkCatalogVersion();
    });
    window.setInterval(checkCatalogVersion, POLL_INTERVAL_MS);
    checkCatalogVersion();
})();
