(() => {
    const POLL_INTERVAL_MS = 15000;
    const MIN_SYNC_GAP_MS = 3000;
    const TAG_IDS = {
        staff: '1548667928881139712',
        restricted: '1548667951069007964',
        blacklisted: '1548667978181247027',
        manager: '1549308000664031323',
        team: '1555048910324760676'
    };

    let syncInFlight = false;
    let lastSyncAt = 0;

    function readSession() {
        const stored = localStorage.getItem('kw_session');
        if (!stored) return null;
        try {
            return JSON.parse(stored);
        } catch {
            localStorage.removeItem('kw_session');
            return null;
        }
    }

    function dispatchSessionUpdate(user) {
        window.dispatchEvent(new CustomEvent('kw-session-updated', { detail: user }));
    }

    async function syncSession() {
        if (syncInFlight || document.visibilityState === 'hidden') return;
        if (Date.now() - lastSyncAt < MIN_SYNC_GAP_MS) return;

        const user = readSession();
        if (!user?.username || !user?.password) return;

        syncInFlight = true;
        lastSyncAt = Date.now();

        try {
            const response = await fetch('/api/get-account', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                cache: 'no-store',
                body: JSON.stringify({
                    username: user.username,
                    password: user.password,
                    threadId: user.threadId
                })
            });

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('kw_session');
                window.location.replace('/index.html');
                return;
            }
            if (!response.ok) return;

            const data = await response.json();
            const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
            if (data.isLocked || tags.includes(TAG_IDS.blacklisted)) {
                localStorage.removeItem('kw_session');
                window.location.replace('/index.html');
                return;
            }

            const isStaff = Boolean(data.isStaff || tags.includes(TAG_IDS.staff));
            const isManager = Boolean(data.isManager || tags.includes(TAG_IDS.manager));
            const isTeam = Boolean(data.isTeam || tags.includes(TAG_IDS.team));
            const updatedUser = {
                ...user,
                ...data,
                password: user.password,
                tags,
                isStaff,
                isManager,
                isTeam,
                isAdmin: Boolean(data.isAdmin || isStaff || isManager),
                isRestricted: Boolean(data.isRestricted || tags.includes(TAG_IDS.restricted)),
                isLocked: false
            };

            const stateFields = [
                'username', 'threadId', 'avatarUrl', 'tags', 'isStaff', 'isManager',
                'isTeam', 'isAdmin', 'isRestricted', 'isLocked', 'role'
            ];
            const hasChanged = stateFields.some(field =>
                JSON.stringify(user[field]) !== JSON.stringify(updatedUser[field])
            );

            if (hasChanged) {
                localStorage.setItem('kw_session', JSON.stringify(updatedUser));
                dispatchSessionUpdate(updatedUser);
            }
        } catch (error) {
            console.warn('[SessionSync] Could not refresh account status:', error.message);
        } finally {
            syncInFlight = false;
        }
    }

    window.addEventListener('focus', syncSession);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') syncSession();
    });
    window.addEventListener('storage', event => {
        if (event.key !== 'kw_session' || !event.newValue) return;
        try {
            dispatchSessionUpdate(JSON.parse(event.newValue));
        } catch {
            localStorage.removeItem('kw_session');
        }
    });

    window.setInterval(syncSession, POLL_INTERVAL_MS);
})();
