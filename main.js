const TAG_IDS = {
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027',
    manager: '1549308000664031323',
    kwteam: '1555048910324760676'
};

let currentUser = null;
let currentPage = 1;
let totalPages = 1;
const itemsPerPage = 10;
let songSearchTimer = null;

async function renderMainAnnouncements() {
    const mainAlert = document.getElementById('main-alert');
    const mainAlertIcon = document.getElementById('main-alert-icon');
    const mainAlertText = document.getElementById('main-alert-text');
    if (!mainAlert || !mainAlertIcon || !mainAlertText) return;

    // Fetch data asynchronously from Cloudflare KV
    const announcementsRaw = await getStoredKWAnnouncements();
    const websiteNote = await getStoredKWWebsiteNote();

    // Normalize announcements into an array format
    let announcements = [];
    if (Array.isArray(announcementsRaw)) {
        announcements = announcementsRaw;
    } else if (announcementsRaw && typeof announcementsRaw === 'object') {
        announcements = [announcementsRaw];
    }

    const activeAnnouncements = announcements.filter(item => item && item.active !== false && !item.clear);
    const note = (websiteNote || '').trim();

    if (activeAnnouncements.length === 0 && !note) {
        mainAlert.classList.add('hidden');
        return;
    }

    const first = activeAnnouncements[0];
    const combinedMessage = note
        ? `${first ? `${first.title}:${first.message}` : 'Website update'}${note ? ` • ${note}` : ''}`
        : (first ? `${first.title}: ${first.message}` : note);

    const type = first?.type || 'info';
    mainAlert.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-yellow-500/10', 'border-yellow-500/20', 'text-yellow-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400', 'bg-sky-500/10', 'border-sky-500/20', 'text-sky-400');
    
    if (type === 'error') {
        mainAlert.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
        mainAlertIcon.setAttribute('data-lucide', 'alert-circle');
    } else if (type === 'warning') {
        mainAlert.classList.add('bg-yellow-500/10', 'border-yellow-500/20', 'text-yellow-400');
        mainAlertIcon.setAttribute('data-lucide', 'triangle-alert');
    } else if (type === 'success') {
        mainAlert.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
        mainAlertIcon.setAttribute('data-lucide=' , 'check-circle');
    } else {
        mainAlert.classList.add('bg-sky-500/10', 'border-sky-500/20', 'text-sky-400');
        mainAlertIcon.setAttribute('data-lucide', 'info');
    }

    mainAlertText.textContent = combinedMessage;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Ensure it runs automatically when the page loads
document.addEventListener('DOMContentLoaded', () => {
    renderMainAnnouncements();
});

function normalizeUserData(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Support nested wrappers like { user: { ... } }, { account: { ... } }, or { data: { ... } }
    const base = raw.user || raw.account || raw.data || raw;

    const username = base.username || base.name || base.user || base.displayName || raw.username || '';
    const password = base.password || base.pass || base.token || raw.password || '';
    const avatarUrl = base.avatarUrl || base.avatar || base.pfp || base.profilePicture || raw.avatarUrl || '';
    const tags = Array.isArray(base.tags) ? base.tags : (Array.isArray(raw.tags) ? raw.tags : []);
    const threadId = base.threadId || raw.threadId || '';

    const isStaff = tags.includes(TAG_IDS.staff);
    const isManager = tags.includes(TAG_IDS.manager);
    const isAdmin = isStaff || isManager;
    const isTeam = tags.includes(TAG_IDS.kwteam);

    return {
        ...raw,
        ...base,
        username,
        password,
        avatarUrl,
        tags,
        threadId,
        isAdmin,
        role: isAdmin ? 'administrator' : 'member',
        isManager,
        isTeam
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Session check: verify local storage first to prevent initial blank freeze or instant redirect
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) {
        console.warn('No active session found in localStorage. Redirecting to login.');
        window.location.href = 'index.html';
        return;
    }

    try {
        const parsed = JSON.parse(sessionData);
        currentUser = normalizeUserData(parsed);
    } catch (e) {
        console.error('Failed to parse session JSON:', e);
        localStorage.removeItem('kw_session');
        window.location.href = 'index.html';
        return;
    }

    if (!currentUser || !currentUser.username) {
        console.warn('Session is missing valid user information. Redirecting to login.');
        localStorage.removeItem('kw_session');
        window.location.href = 'index.html';
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const requestedPage = Number.parseInt(urlParams.get('page'), 10);
    currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = urlParams.get('search') || '';

    // 2. Render UI immediately using normalized credentials
    setupMemberProfile();
    const initialTab = restoreMainTabFromUrl('library');
    window.switchTab(initialTab);
    loadSongLibrary(currentPage);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 3. Search input listener
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSongs(e.target.value);
        });
    }

    // 4. Track submission form listener (supports both in-page form and modal)
    const uploadForm = document.getElementById('upload-form') || document.getElementById('modal-upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitSongRequest();
        });
    }

    // 5. Logout listeners for any logout buttons in navbar or sidebar
    const logoutBtns = document.querySelectorAll('.logout-btn, #logout-btn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.logout();
        });
    });

    // Render any existing announcements on initial page load
    renderMainAnnouncements();

    // Listen for updates from the admin panel / other tabs
    window.addEventListener('storage', (e) => {
        if (e.key === 'kw_team_announcements' || e.key === 'kw_team_website_note') {
            renderMainAnnouncements();
        }
    });

    // 6. Sync session state against Worker/Discord backend in the background
    await refreshUserSession();
});

// Configure Member Profile & reveal admin links if staff
function setupMemberProfile() {
    if (!currentUser) return;

    const displayName = document.getElementById('user-display-name') || document.getElementById('display-name') || document.getElementById('username-display');
    const avatar = document.getElementById('user-avatar') || document.getElementById('avatar-container');
    const roleBadge = document.getElementById('user-role-badge') || document.getElementById('role-badge');
    const adminLinks = document.getElementById('admin-links') || document.getElementById('admin-nav');

    if (displayName) {
        displayName.textContent = currentUser.username || 'Member';
    }

    if (adminLinks) {
        adminLinks.classList.toggle('hidden', !(currentUser.isAdmin || currentUser.isManager || currentUser.isTeam));
    }

    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${escapeUrl(currentUser.avatarUrl)}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        } else {
            avatar.textContent = (currentUser.username || 'M').charAt(0).toUpperCase();
        }
    }

    // If user is admin/staff, reveal the Admin Hub link in sidebar
    if (currentUser.isAdmin) {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> KW Moderation`;
        }
        if (adminLinks) {
            adminLinks.classList.remove('hidden');
        }
    } else {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> Member`;
        }
    }

    if (currentUser.isManager) {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Guide Manager`;
        }
        if (adminLinks) {
            adminLinks.classList.remove('hidden');
        }
    }

    if (currentUser.isTeam) {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> KW Team`;
        }
        if (adminLinks) {
            adminLinks.classList.remove('hidden');
        }
    }
}

window.addEventListener('kw-session-updated', event => {
    currentUser = normalizeUserData(event.detail);
    setupMemberProfile();
});

window.addEventListener('kw-song-catalog-updated', () => loadSongLibrary(currentPage));

function restoreMainTabFromUrl(defaultTab = 'library') {
    const validTabs = new Set(['library', 'upload', 'my-submissions']);
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get('tab');
    const tab = validTabs.has(requestedTab) ? requestedTab : defaultTab;
    if (requestedTab !== tab) {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }
    return tab;
}

// Tab switcher for main.html
window.switchTab = function(tabName) {
    const validTabs = new Set(['library', 'upload', 'my-submissions']);
    const nextTab = validTabs.has(tabName) ? tabName : 'library';

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const activeSection = document.getElementById(`content-${nextTab}`);
    if (activeSection) activeSection.classList.remove('hidden');

    const activeBtn = document.getElementById(`tab-${nextTab}`);
    if (activeBtn) activeBtn.classList.add('active');

    const url = new URL(window.location.href);
    const currentTab = url.searchParams.get('tab') || 'library';
    if (currentTab !== nextTab) {
        if (currentTab === 'library') {
            const searchInput = document.getElementById('search-input');
            const hadLibraryFilter = Boolean(searchInput?.value.trim()) ||
                currentPage !== 1 ||
                url.searchParams.has('search') ||
                url.searchParams.has('page');
            window.clearTimeout(songSearchTimer);
            if (searchInput) searchInput.value = '';
            currentPage = 1;
            url.searchParams.delete('search');
            url.searchParams.delete('page');
            if (hadLibraryFilter) loadSongLibrary(1, '');
        }
        url.searchParams.set('tab', nextTab);
        window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    }

    hideAlert();

    // Trigger submissions load when switching to My Submissions tab
    if (nextTab === 'my-submissions' || nextTab === 'submissions') {
        loadMySubmissions();
    }

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

window.addEventListener('popstate', () => {
    const tab = restoreMainTabFromUrl('library');
    if (tab) {
        window.switchTab(tab);
    }
});

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = 'index.html';
};

async function refreshUserSession() {
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) return;

    try {
        const rawUser = JSON.parse(sessionData);
        const user = normalizeUserData(rawUser);
        
        // Safety Guard: Don't query Worker API if credentials are missing
        if (!user || !user.username || !user.password) {
            console.warn('Session missing valid username or password. Keeping local session active.');
            return;
        }

        const response = await fetch(`/api/get-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: user.username, 
                password: user.password 
            })
        });

        // Only redirect on explicit authorization rejections (401/403)
        if (response.status === 401 || response.status === 403) {
            console.error('Account authentication rejected by worker:', response.status);
            localStorage.removeItem('kw_session');
            window.location.href = 'index.html';
            return;
        }

        if (!response.ok) {
            console.warn(`Background session check received status ${response.status}. Retaining local session.`);
            return;
        }

        const data = await response.json();
        const userTags = data.tags || [];

        // Check if blacklisted or locked in real time
        if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
            console.warn('User account is restricted or blacklisted.');
            localStorage.removeItem('kw_session');
            alert('Your account has been restricted or blacklisted.');
            window.location.href = 'index.html';
            return;
        }

        // Recalculate staff status dynamically
        const isStaff = Boolean(
            data.isAdmin || 
            userTags.includes(TAG_IDS.staff)
        );

        const isManager = Boolean(
            data.isManager || userTags.includes(TAG_IDS.manager)
        );

        const isTeam = Boolean(
            data.isTeam || userTags.includes(TAG_IDS.kwteam)
        );

        // Update local session object while retaining existing properties
        const updatedUser = {
            ...user,
            ...data,
            tags: userTags,
            isAdmin: isStaff,
            isManager: isManager,
            isTeam: isTeam,
            role: isStaff ? 'administrator' : 'member',
            threadId: data.threadId || user.threadId,
            avatarUrl: data.avatarUrl || user.avatarUrl
        };
        
        currentUser = updatedUser;
        localStorage.setItem('kw_session', JSON.stringify(updatedUser));
        
        // Refresh UI state with updated privileges
        setupMemberProfile();

    } catch (err) {
        console.error('Failed to sync session background state (network issue):', err);
    }
}

// UI Alert Helper
function showAlert(message, type = 'error') {
    const alertBox = document.getElementById('main-alert');
    const alertText = document.getElementById('main-alert-text');
    const alertIcon = document.getElementById('main-alert-icon');

    if (!alertBox) {
        alert(message);
        return;
    }

    alertBox.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400');

    if (type === 'error') {
        alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
        if (alertIcon) alertIcon.setAttribute('data-lucide', 'alert-circle');
    } else {
        alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
        if (alertIcon) alertIcon.setAttribute('data-lucide', 'check-circle');
    }

    if (alertText) alertText.textContent = message;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.hideAlert = function() {
    const alertBox = document.getElementById('main-alert');
    if (alertBox) alertBox.classList.add('hidden');
};

// Load approved songs for the current page from Worker API with a loading state
async function loadSongLibrary(page = currentPage, search = document.getElementById('search-input')?.value || '') {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    songListContainer.innerHTML = `
        <div class="col-span-full text-center py-12 glass rounded-3xl border border-white/10 flex flex-col items-center justify-center space-y-3">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-green-400"></i>
            <p class="text-slate-400 text-xs font-medium">Loading tracks...</p>
        </div>
    `;
    if (typeof lucide !== 'undefined') lucide.createIcons();

    try {
        const params = new URLSearchParams({ page: String(page), limit: String(itemsPerPage) });
        if (search.trim()) params.set('search', search.trim());
        const response = await fetch(`/api/songs?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        const data = await response.json();
        currentPage = Number(data.page) || 1;
        totalPages = Number(data.totalPages) || 1;
        window.setSongCatalogVersion?.(data.version);
        renderSongs(Array.isArray(data.songs) ? data.songs : []);
        updateMainUrlState(currentPage, search);
    } catch (err) {
        console.error('Error loading songs:', err);
        songListContainer.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-10">Unable to load songs at this time.</p>`;
    }
}

// Render song cards into the grid
function renderSongs(songs) {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    if (!songs || songs.length === 0) {
        songListContainer.innerHTML = `
            <div class="col-span-full text-center py-12 glass rounded-3xl border border-white/10">
                <i data-lucide="music" class="w-8 h-8 mx-auto text-slate-500 mb-2"></i>
                <p class="text-slate-400 text-sm">No approved songs found.</p>
            </div>
        `;
        renderPaginationControls();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    songListContainer.innerHTML = songs.map(song => {
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const rawVideoId = song.videoId || '';
        const songId = song.id || ''; // Get the unique song ID from JSON

        let playUrl = '#';
        if (rawVideoId.startsWith('http://') || rawVideoId.startsWith('https://')) {
            playUrl = rawVideoId;
        } else if (rawVideoId.trim().length > 0) {
            playUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(rawVideoId.trim())}`;
        }

        const playButtonHtml = playUrl !== '#' 
            ? `<a href="${escapeUrl(playUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 border border-white/10">
                    <i data-lucide="play" class="w-3.5 h-3.5 text-green-400"></i> Play Track
               </a>`
            : `<span class="px-3 py-1.5 bg-white/5 text-slate-500 font-medium rounded-lg text-xs cursor-not-allowed border border-white/5">
                    No Link
               </span>`;

        return `
        <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-green-500/30 transition-all">
            <div>
                <div class="flex items-start justify-between gap-2 mb-1">
                    <h3 class="font-bold text-base text-white tracking-tight">${escapeHtml(title)}</h3>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">Ready</span>
                </div>
                <p class="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
                    <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                </p>
                <!-- Song ID Pill / Text -->
                <div class="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono bg-black/30 px-2.5 py-1 rounded-lg border border-white/5 w-fit">
                    <span class="text-slate-500">ID:</span> 
                    <span class="select-all text-emerald-400 font-medium">${escapeHtml(songId)}</span>
                </div>
            </div>
            <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                <span class="text-slate-500 text-[11px]">Requested by ${escapeHtml(uploader)}</span>
                ${playButtonHtml}
            </div>
        </div>
        `;
    }).join('');

    renderPaginationControls();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Load and filter user submissions independently
async function loadMySubmissions() {
    const submissionsContainer = document.getElementById('my-submissions-list') || document.getElementById('submissions-list');
    if (!submissionsContainer) return;

    if (!currentUser || !currentUser.username) {
        submissionsContainer.innerHTML = `<p class="text-slate-500 text-xs text-center py-10 col-span-full">Please log in to view your submissions.</p>`;
        return;
    }

    try {
        const mySubmissions = [];
        let page = 1;
        let totalPages = 1;
        while (page <= totalPages) {
            const params = new URLSearchParams({
                page: String(page),
                limit: '100',
                submittedBy: currentUser.username
            });
            const response = await fetch(`/api/songs?${params}`, { cache: 'no-store' });
            if (!response.ok) throw new Error('Failed to fetch submissions');
            const data = await response.json();
            mySubmissions.push(...(Array.isArray(data.songs) ? data.songs : []));
            totalPages = Number(data.totalPages) || 0;
            page++;
        }

        renderMySubmissions(mySubmissions);
    } catch (err) {
        console.error('Error loading submissions:', err);
        submissionsContainer.innerHTML = `<p class="text-slate-500 text-xs text-center py-10 col-span-full">Unable to load your submissions.</p>`;
    }
}

// Render user's submission cards
function renderMySubmissions(submissions) {
    const submissionsContainer = document.getElementById('my-submissions-list') || document.getElementById('submissions-list');
    if (!submissionsContainer) return;

    if (!submissions || submissions.length === 0) {
        submissionsContainer.innerHTML = `
            <div class="col-span-full text-center py-12 glass rounded-3xl border border-white/10">
                <i data-lucide="file-music" class="w-8 h-8 mx-auto text-slate-500 mb-2"></i>
                <p class="text-slate-400 text-sm">You haven't submitted any track requests yet.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    submissionsContainer.innerHTML = submissions.map(sub => {
        const title = sub.songName || 'Untitled';
        const artist = sub.artist || 'Unknown Artist';
        
        const statusBadge = sub.approvedAt 
            ? `<span class="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">Approved</span>`
            : `<span class="px-2.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>`;

        const rawVideoId = sub.videoId || '';
        let playUrl = '#';
        if (rawVideoId.startsWith('http://') || rawVideoId.startsWith('https://')) {
            playUrl = rawVideoId;
        } else if (rawVideoId.trim().length > 0) {
            playUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(rawVideoId.trim())}`;
        }

        const playButtonHtml = playUrl !== '#' 
            ? `<a href="${escapeUrl(playUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 border border-white/10 text-xs">
                    <i data-lucide="external-link" class="w-3.5 h-3.5 text-slate-400"></i> View Track
               </a>`
            : `<span class="px-3 py-1.5 bg-white/5 text-slate-500 font-medium rounded-lg text-xs cursor-not-allowed border border-white/5">
                    No Link
               </span>`;

        const dateString = sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : 'Submitted';

        return `
        <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-slate-500/30 transition-all">
            <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-bold text-base text-white tracking-tight">${escapeHtml(title)}</h3>
                    ${statusBadge}
                </div>
                <p class="text-xs text-slate-400 flex items-center gap-1.5">
                    <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                </p>
            </div>
            <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                <span class="text-slate-500 text-[11px]">${dateString}</span>
                ${playButtonHtml}
            </div>
        </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Render dynamic pagination arrows using server-side totalPages
function renderPaginationControls() {
    let controlsContainer = document.getElementById('pagination-controls');

    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'pagination-controls';
        controlsContainer.className = 'col-span-full flex items-center justify-between pt-6 mt-4 border-t border-white/10';
        
        const librarySection = document.getElementById('content-library');
        if (librarySection) {
            librarySection.appendChild(controlsContainer);
        }
    }

    if (totalPages <= 1) {
        controlsContainer.innerHTML = '';
        return;
    }

    controlsContainer.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">
            Page <span class="text-white font-bold">${currentPage}</span> of <span class="text-white font-bold">${totalPages}</span>
        </div>
        <div class="flex items-center gap-2">
            <button 
                onclick="changePage(-1)" 
                ${currentPage === 1 ? 'disabled' : ''} 
                class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentPage === 1 ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                <i data-lucide="chevron-left" class="w-4 h-4"></i> Previous
            </button>

            <button 
                onclick="changePage(1)" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentPage === totalPages ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                Next <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Handle pagination page switches 
window.changePage = function(direction) {
    currentPage += direction;

    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const search = document.getElementById('search-input')?.value || '';
    updateMainUrlState(currentPage, search, 'pushState');
    loadSongLibrary(currentPage, search);
    
    const libraryHeader = document.getElementById('content-library');
    if (libraryHeader) {
        libraryHeader.scrollIntoView({ behavior: 'smooth' });
    }
};

// Search and filter placeholder (can be expanded later for server-side search)
function filterSongs(query) {
    currentPage = 1;
    window.clearTimeout(songSearchTimer);
    songSearchTimer = window.setTimeout(() => {
        updateMainUrlState(currentPage, query, 'pushState');
        loadSongLibrary(1, query);
    }, 250);
}

function updateMainUrlState(page, search, historyMethod = 'replaceState') {
    const url = new URL(window.location.href);
    const currentUrl = `${url.pathname}${url.search}${url.hash}`;
    if (page > 1) url.searchParams.set('page', String(page));
    else url.searchParams.delete('page');
    if (search.trim()) url.searchParams.set('search', search.trim());
    else url.searchParams.delete('search');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    if (nextUrl !== currentUrl) window.history[historyMethod]({}, '', nextUrl);
}

window.addEventListener('popstate', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const requestedPage = Number.parseInt(urlParams.get('page'), 10);
    currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = urlParams.get('search') || '';
    loadSongLibrary(currentPage, searchInput?.value || '');
});

// Extract YouTube Video ID from any URL format or raw ID
function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const str = urlOrId.trim();
    
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
    const match = str.match(ytRegex);
    if (match && match[1]) {
        return match[1];
    }
    
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) {
        return str;
    }
    return str;
}

// Handle Song Request Form
async function submitSongRequest() {
    const titleInput = document.getElementById('track-title') || document.getElementById('modal-track-title');
    const artistInput = document.getElementById('track-artist') || document.getElementById('modal-track-artist');
    const urlInput = document.getElementById('track-url') || document.getElementById('modal-track-url');
    const submitBtn = document.getElementById('submit-track-btn');

    const title = titleInput ? titleInput.value.trim() : '';
    const artist = artistInput ? artistInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';

    if (!title || !artist || !url) {
        showAlert('Please fill in all track fields.', 'error');
        return;
    }

    const videoId = extractYouTubeId(url);

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span>Submitting to Queue...</span>`;
    }

    try {
        const response = await fetch(`/api/submit-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                songName: title, 
                artist: artist, 
                videoId: videoId,
                timestamp: 0,
                submittedBy: currentUser ? currentUser.username : 'Guest',
                threadId: currentUser ? currentUser.threadId : '' 
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit track request.');
        }

        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
        if (urlInput) urlInput.value = '';

        showAlert('Song successfully submitted! A staff member will review it shortly.', 'success');

        const modal = document.getElementById('upload-modal') || document.getElementById('track-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        setTimeout(() => {
            switchTab('library');
        }, 2000);

    } catch (err) {
        console.error('Submission error:', err);
        showAlert(err.message || 'Error submitting track. Please try again.', 'error');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Submit to Moderation Queue</span>`;
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    }
}

// Helper utilities
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '#';
    } catch {
        return '#';
    }
}