// dashboard.js - Admin & Moderation Operations

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

// Discord Forum Tag IDs
const TAG_IDS = {
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027',
    manager: '1549308000664031323'
};

// Global State
let currentUser = null;
let allPendingRequests = [];
let allSongs = [];
let allUsers = [];

// Filtering & Sorting State
let songSearchQuery = '';
let songSortBy = 'title';

let userSearchQuery = '';
let userRoleFilter = 'all';

// Pagination State (10 items per page)
const ITEMS_PER_PAGE = 10;
let songCurrentPage = 1;
let userCurrentPage = 1;

/**
 * Normalizes user session data across varying payload structures.
 */
function normalizeUserData(raw) {
    if (!raw || typeof raw !== 'object') return null;

    const base = raw.user || raw.account || raw.data || raw;

    const username = base.username || base.name || base.user || base.displayName || raw.username || '';
    const password = base.password || base.pass || base.token || raw.password || '';
    const avatarUrl = base.avatarUrl || base.avatar || base.pfp || base.profilePicture || raw.avatarUrl || '';
    const tags = Array.isArray(base.tags) ? base.tags : (Array.isArray(raw.tags) ? raw.tags : []);

    const isAdmin = Boolean(
        base.isAdmin || 
        raw.isAdmin || 
        base.admin || 
        raw.admin || 
        base.role === 'admin' || 
        base.role === 'administrator' || 
        tags.includes(TAG_IDS.staff)
    );

    const isManager = Boolean(
        base.isManager || raw.isManager || base.role === 'manager' || tags.includes(TAG_IDS.manager)
    );

    return {
        ...raw,
        ...base,
        username,
        password,
        avatarUrl,
        tags,
        isAdmin,
        isManager,
        role: isAdmin ? 'administrator' : 'member'
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Check Session
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) {
        window.location.href = 'index.html';
        return;
    }

    try {
        currentUser = normalizeUserData(JSON.parse(sessionData));
    } catch (e) {
        console.error('Failed to parse session:', e);
        localStorage.removeItem('kw_session');
        window.location.href = 'index.html';
        return;
    }

    // Restrict access to Admins / Managers only
    if (!currentUser || (!currentUser.isAdmin && !currentUser.isManager)) {
        alert('Access Denied: You must be an administrator or manager to access the Admin Hub.');
        window.location.href = 'main.html';
        return;
    }

    // 2. Initial Setup
    setupAdminProfile();
    loadPendingRequests();
    loadSongs();
    loadUserList();

    // 3. Search & Filter Input Listeners
    const songSearchInput = document.getElementById('song-search-input');
    if (songSearchInput) {
        songSearchInput.addEventListener('input', (e) => filterSongs(e.target.value));
    }

    const songSortSelect = document.getElementById('song-sort-select');
    if (songSortSelect) {
        songSortSelect.addEventListener('change', (e) => sortSongs(e.target.value));
    }

    const userSearchInput = document.getElementById('user-search-input');
    if (userSearchInput) {
        userSearchInput.addEventListener('input', (e) => filterUsers(e.target.value));
    }

    // 4. Modals and Direct Submissions
    const addTrackForm = document.getElementById('add-track-modal-form');
    if (addTrackForm) {
        addTrackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await addTrackDirectly();
        });
    }

    const editTrackForm = document.getElementById('edit-track-modal-form');
    if (editTrackForm) {
        editTrackForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await updateTrackDirectly();
        });
    }

    // 5. Logout Listener
    const logoutBtns = document.querySelectorAll('.logout-btn, #logout-btn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            window.logout();
        });
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();

    // Background session verification
    await refreshUserSession();
});

function setupAdminProfile() {
    if (!currentUser) return;

    const displayName = document.getElementById('admin-display-name');
    const roleBadge = document.getElementById('admin-role-badge');
    const avatar = document.getElementById('admin-avatar');

    if (displayName) displayName.textContent = currentUser.username || 'Admin';

    if (roleBadge) {
        if (currentUser.isManager) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Manager`;
        } else {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Moderator`;
        }
    }

    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${escapeUrl(currentUser.avatarUrl)}" alt="Avatar" class="w-full h-full object-cover rounded-full">`;
        } else {
            avatar.textContent = (currentUser.username || 'A').charAt(0).toUpperCase();
        }
    }
}

// Tab Switcher
window.switchAdminTab = function(tabName) {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.admin-nav-btn').forEach(btn => btn.classList.remove('active', 'bg-white/10', 'text-white'));

    const activeSection = document.getElementById(`admin-content-${tabName}`);
    if (activeSection) activeSection.classList.remove('hidden');

    const activeBtn = document.getElementById(`admin-tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active', 'bg-white/10', 'text-white');

    hideDashboardAlert();
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = 'index.html';
};

// UI Alerts
function showDashboardAlert(message, type = 'error') {
    const alertBox = document.getElementById('dashboard-alert');
    const alertText = document.getElementById('dashboard-alert-text');
    const alertIcon = document.getElementById('dashboard-alert-icon');

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
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.hideDashboardAlert = function() {
    const alertBox = document.getElementById('dashboard-alert');
    if (alertBox) alertBox.classList.add('hidden');
};

// ==========================================
// 1. PENDING REQUESTS MODERATION
// ==========================================

async function loadPendingRequests() {
    const container = document.getElementById('pending-list');
    const badge = document.getElementById('pending-count-badge');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/pending-requests`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        allPendingRequests = await response.json();
        if (badge) badge.textContent = allPendingRequests.length;

        renderPendingRequests(allPendingRequests);
    } catch (err) {
        console.error('Error fetching pending requests:', err);
        container.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">Failed to load pending queue.</p>`;
    }
}

function renderPendingRequests(requests) {
    const container = document.getElementById('pending-list');
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-10 glass rounded-2xl border border-white/10">
                <i data-lucide="check-circle-2" class="w-8 h-8 mx-auto text-green-400 mb-2"></i>
                <p class="text-slate-400 text-sm">All submission requests are clear!</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    container.innerHTML = requests.map(req => {
        const reqId = escapeAttr(req.id || req._id || '');
        const title = req.songName || req.title || 'Untitled';
        const artist = req.artist || 'Unknown Artist';
        const uploader = req.submittedBy || 'Member';
        const rawVideoId = req.videoId || '';
        const playUrl = rawVideoId.startsWith('http') ? rawVideoId : `https://www.youtube.com/watch?v=${rawVideoId}`;

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <h3 class="font-bold text-base text-white line-clamp-1">${escapeHtml(title)}</h3>
                        <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">Pending</span>
                    </div>
                    <p class="text-xs text-slate-400 flex items-center gap-1.5">
                        <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                    </p>
                </div>
                <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <span class="text-slate-500 text-[11px] truncate">By ${escapeHtml(uploader)}</span>
                    <div class="flex items-center gap-2">
                        <a href="${escapeUrl(playUrl)}" target="_blank" class="p-2 bg-white/5 hover:bg-white/10 text-white rounded-lg transition-all border border-white/10" title="Preview Track">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                        <button onclick="approveTrack('${reqId}')" class="px-3 py-1.5 bg-green-500/10 hover:bg-green-500/20 text-green-400 font-bold rounded-lg transition-all flex items-center gap-1 border border-green-500/20">
                            <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                        </button>
                        <button onclick="rejectTrack('${reqId}')" class="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all flex items-center gap-1 border border-red-500/20">
                            <i data-lucide="x" class="w-3.5 h-3.5"></i> Reject
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.approveTrack = async function(requestId) {
    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/approve-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: requestId })
        });

        if (!response.ok) throw new Error('Failed to approve track.');

        showDashboardAlert('Track approved and added to live catalog!', 'success');
        await loadPendingRequests();
        await loadSongs();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
};

window.rejectTrack = async function(requestId) {
    if (!confirm('Are you sure you want to reject and remove this submission request?')) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/reject-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: requestId })
        });

        if (!response.ok) throw new Error('Failed to reject track.');

        showDashboardAlert('Submission request rejected.', 'success');
        await loadPendingRequests();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
};

window.approveAllPending = async function() {
    if (!allPendingRequests.length) return;
    if (!confirm(`Are you sure you want to approve ALL ${allPendingRequests.length} pending tracks?`)) return;

    try {
        for (const req of allPendingRequests) {
            const reqId = req.id || req._id;
            await fetch(`${WORKER_BASE_URL}/api/approve-track`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: reqId })
            });
        }

        showDashboardAlert('All pending tracks approved!', 'success');
        await loadPendingRequests();
        await loadSongs();
    } catch (err) {
        showDashboardAlert('Error approving batch tracks: ' + err.message, 'error');
    }
};


// ==========================================
// 2. SONG CATALOG MANAGEMENT (PAGINATED - 10/PAGE)
// ==========================================

async function loadSongs() {
    const container = document.getElementById('song-list');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        allSongs = await response.json();
        songCurrentPage = 1;
        renderSongs(allSongs);
    } catch (err) {
        console.error('Error loading catalog songs:', err);
        container.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">Unable to load catalog.</p>`;
    }
}

function renderSongs(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    // 1. Filter
    let filtered = songs.filter(s => {
        const q = songSearchQuery.toLowerCase();
        return (
            (s.songName || s.title || '').toLowerCase().includes(q) ||
            (s.artist || '').toLowerCase().includes(q) ||
            (s.submittedBy || '').toLowerCase().includes(q)
        );
    });

    // 2. Sort
    filtered.sort((a, b) => {
        if (songSortBy === 'artist') {
            return (a.artist || '').localeCompare(b.artist || '');
        } else if (songSortBy === 'uploader') {
            return (a.submittedBy || '').localeCompare(b.submittedBy || '');
        } else {
            return (a.songName || a.title || '').localeCompare(b.songName || b.title || '');
        }
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No matching tracks found in catalog.</p>`;
        renderPaginationControls('song-pagination-controls', 1, 0, 'changeSongPage');
        return;
    }

    // 3. Paginate (10 songs per page)
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (songCurrentPage > totalPages) songCurrentPage = totalPages;
    if (songCurrentPage < 1) songCurrentPage = 1;

    const startIndex = (songCurrentPage - 1) * ITEMS_PER_PAGE;
    const paginatedSongs = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // 4. Render Grid
    container.innerHTML = paginatedSongs.map(song => {
        const songId = escapeAttr(song.id || song._id || '');
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const videoId = song.videoId || '';
        const playUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-green-500/30 transition-all">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <h3 class="font-bold text-base text-white line-clamp-1">${escapeHtml(title)}</h3>
                        <span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-green-500/10 text-green-400 border border-green-500/20">Live</span>
                    </div>
                    <p class="text-xs text-slate-400 flex items-center gap-1.5">
                        <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                    </p>
                </div>
                <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs gap-2">
                    <span class="text-slate-500 text-[11px] truncate">By ${escapeHtml(uploader)}</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="openEditTrackModal('${songId}')" class="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5 text-sky-400"></i> Edit
                        </button>
                        <button onclick="copyVRUrl('${escapeAttr(playUrl)}')" class="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs" title="Copy URL">
                            <i data-lucide="copy" class="w-3.5 h-3.5 text-green-400"></i>
                        </button>
                        <button onclick="deleteSong('${songId}')" id="btn-delete-${songId}" class="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all flex items-center gap-1 border border-red-500/20 text-xs">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // 5. Render Pagination
    renderPaginationControls('song-pagination-controls', songCurrentPage, totalPages, 'changeSongPage', 'admin-content-catalog');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.filterSongs = function(query) {
    songSearchQuery = query || '';
    songCurrentPage = 1;
    renderSongs(allSongs);
};

window.sortSongs = function(sortBy) {
    songSortBy = sortBy || 'title';
    songCurrentPage = 1;
    renderSongs(allSongs);
};

window.changeSongPage = function(delta) {
    songCurrentPage += delta;
    renderSongs(allSongs);
};


// Track Management Actions
window.openAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) modal.classList.add('hidden');
};

async function addTrackDirectly() {
    const title = document.getElementById('modal-add-title')?.value.trim();
    const artist = document.getElementById('modal-add-artist')?.value.trim();
    const url = document.getElementById('modal-add-url')?.value.trim();

    if (!title || !artist || !url) {
        showDashboardAlert('Please complete all track fields.', 'error');
        return;
    }

    const videoId = extractYouTubeId(url);

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/add-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songName: title,
                artist,
                videoId,
                submittedBy: currentUser.username || 'Admin'
            })
        });

        if (!response.ok) throw new Error('Failed to add track.');

        closeAddTrackModal();
        showDashboardAlert('Track added directly to catalog!', 'success');
        await loadSongs();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
}

window.openEditTrackModal = function(songId) {
    const song = allSongs.find(s => (s.id || s._id) === songId);
    if (!song) return;

    document.getElementById('modal-edit-id').value = songId;
    document.getElementById('modal-edit-title').value = song.songName || song.title || '';
    document.getElementById('modal-edit-artist').value = song.artist || '';
    document.getElementById('modal-edit-url').value = song.videoId || '';

    const modal = document.getElementById('edit-track-modal');
    if (modal) modal.classList.remove('hidden');
};

window.closeEditTrackModal = function() {
    const modal = document.getElementById('edit-track-modal');
    if (modal) modal.classList.add('hidden');
};

async function updateTrackDirectly() {
    const songId = document.getElementById('modal-edit-id')?.value;
    const title = document.getElementById('modal-edit-title')?.value.trim();
    const artist = document.getElementById('modal-edit-artist')?.value.trim();
    const url = document.getElementById('modal-edit-url')?.value.trim();

    if (!title || !artist || !url) {
        showDashboardAlert('Please complete all track fields.', 'error');
        return;
    }

    const videoId = extractYouTubeId(url);

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/update-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: songId, songName: title, artist, videoId })
        });

        if (!response.ok) throw new Error('Failed to update track.');

        closeEditTrackModal();
        showDashboardAlert('Track details updated!', 'success');
        await loadSongs();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
}

window.deleteSong = async function(songId) {
    if (!confirm('Are you sure you want to permanently delete this track from the library?')) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/delete-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: songId })
        });

        if (!response.ok) throw new Error('Failed to delete track.');

        showDashboardAlert('Track deleted from library.', 'success');
        await loadSongs();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
};

window.copyVRUrl = function(url) {
    navigator.clipboard.writeText(url).then(() => {
        showDashboardAlert('URL copied to clipboard!', 'success');
    }).catch(() => {
        showDashboardAlert('Failed to copy URL.', 'error');
    });
};


// ==========================================
// 3. USER MODERATION & ROLES (PAGINATED - 10/PAGE)
// ==========================================

async function loadUserList() {
    const container = document.getElementById('user-list');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/get-all-users`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        allUsers = await response.json();
        userCurrentPage = 1;
        renderUserList(allUsers);
    } catch (err) {
        console.error('Error fetching user list:', err);
        container.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">Failed to load users.</p>`;
    }
}

function renderUserList(users) {
    const container = document.getElementById('user-list');
    if (!container) return;

    // 1. Filter Users
    let filtered = users.filter(u => {
        const q = userSearchQuery.toLowerCase();
        const matchesQuery = (u.username || '').toLowerCase().includes(q) || (u.id || '').toLowerCase().includes(q);
        
        if (userRoleFilter === 'admin') return matchesQuery && u.isAdmin;
        if (userRoleFilter === 'restricted') return matchesQuery && u.tags?.includes(TAG_IDS.restricted);
        if (userRoleFilter === 'blacklisted') return matchesQuery && u.tags?.includes(TAG_IDS.blacklisted);
        return matchesQuery;
    });

    if (filtered.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No matching users found.</p>`;
        renderPaginationControls('user-pagination-controls', 1, 0, 'changeUserPage');
        return;
    }

    // 2. Paginate (10 users per page)
    const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
    if (userCurrentPage > totalPages) userCurrentPage = totalPages;
    if (userCurrentPage < 1) userCurrentPage = 1;

    const startIndex = (userCurrentPage - 1) * ITEMS_PER_PAGE;
    const paginatedUsers = filtered.slice(startIndex, startIndex + ITEMS_PER_PAGE);

    // 3. Render Grid
    container.innerHTML = paginatedUsers.map(user => {
        const userId = escapeAttr(user.id || user.username);
        const username = escapeHtml(user.username || 'Unknown');
        const isUserAdmin = Boolean(user.isAdmin);
        const isRestricted = user.tags?.includes(TAG_IDS.restricted);
        const isBlacklisted = user.tags?.includes(TAG_IDS.blacklisted);

        let roleBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-slate-500/10 text-slate-400 border border-slate-500/20">Member</span>`;
        if (isBlacklisted) roleBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/20">Blacklisted</span>`;
        else if (isRestricted) roleBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">Restricted</span>`;
        else if (isUserAdmin) roleBadge = `<span class="px-2 py-0.5 text-[10px] font-bold rounded-md bg-purple-500/10 text-purple-400 border border-purple-500/20">Staff</span>`;

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white/10 border border-white/10 flex items-center justify-center font-bold text-white text-sm">
                            ${user.avatarUrl ? `<img src="${escapeUrl(user.avatarUrl)}" class="w-full h-full object-cover rounded-full">` : username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <h3 class="font-bold text-sm text-white">${username}</h3>
                            <p class="text-[11px] text-slate-500">ID: ${userId}</p>
                        </div>
                    </div>
                    ${roleBadge}
                </div>
                <div class="pt-4 border-t border-white/5 flex items-center justify-end gap-2 text-xs">
                    <button onclick="toggleUserRole('${userId}', 'restricted')" class="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-lg transition-all border border-white/10">
                        ${isRestricted ? 'Unrestrict' : 'Restrict'}
                    </button>
                    <button onclick="toggleUserRole('${userId}', 'blacklisted')" class="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all border border-red-500/20">
                        ${isBlacklisted ? 'Unblacklist' : 'Blacklist'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    // 4. Render Pagination Controls
    renderPaginationControls('user-pagination-controls', userCurrentPage, totalPages, 'changeUserPage', 'admin-content-users');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.filterUsers = function(query) {
    userSearchQuery = query || '';
    userCurrentPage = 1;
    renderUserList(allUsers);
};

window.filterUserRole = function(role) {
    userRoleFilter = role || 'all';
    userCurrentPage = 1;
    renderUserList(allUsers);
};

window.changeUserPage = function(delta) {
    userCurrentPage += delta;
    renderUserList(allUsers);
};

window.toggleUserRole = async function(userId, tagType) {
    const tagId = TAG_IDS[tagType];
    if (!tagId) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/toggle-user-tag`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, tagId })
        });

        if (!response.ok) throw new Error('Failed to update user roles.');

        showDashboardAlert('User privileges updated successfully!', 'success');
        await loadUserList();
    } catch (err) {
        showDashboardAlert(err.message, 'error');
    }
};


// ==========================================
// 4. REUSABLE PAGINATION CONTROLS
// ==========================================

function renderPaginationControls(containerId, currentPage, totalPages, pageChangeFunctionName, scrollTargetId = null) {
    let container = document.getElementById(containerId);

    // Dynamically insert element if not present in the HTML DOM
    if (!container) {
        const parentSection = document.getElementById(scrollTargetId);
        if (!parentSection) return;

        container = document.createElement('div');
        container.id = containerId;
        parentSection.appendChild(container);
    }

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.className = 'col-span-full flex items-center justify-between pt-6 mt-4 border-t border-white/10';
    container.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">
            Page <span class="text-white font-bold">${currentPage}</span> of <span class="text-white font-bold">${totalPages}</span>
        </div>
        <div class="flex items-center gap-2">
            <button 
                onclick="${pageChangeFunctionName}(-1); ${scrollTargetId ? `scrollToSection('${scrollTargetId}')` : ''}" 
                ${currentPage === 1 ? 'disabled' : ''} 
                class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentPage === 1 ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                <i data-lucide="chevron-left" class="w-4 h-4"></i> Previous
            </button>

            <button 
                onclick="${pageChangeFunctionName}(1); ${scrollTargetId ? `scrollToSection('${scrollTargetId}')` : ''}" 
                ${currentPage === totalPages ? 'disabled' : ''} 
                class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentPage === totalPages ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                Next <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.scrollToSection = function(sectionId) {
    const target = document.getElementById(sectionId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
    }
};


// ==========================================
// 5. BACKGROUND USER SESSION SYNC & HELPERS
// ==========================================

async function refreshUserSession() {
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) return;

    try {
        const rawUser = JSON.parse(sessionData);
        const user = normalizeUserData(rawUser);

        if (!user || !user.username || !user.password) return;

        const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, password: user.password })
        });

        if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('kw_session');
            window.location.href = 'index.html';
            return;
        }

        if (!response.ok) return;

        const data = await response.json();
        const userTags = data.tags || [];

        const isStaff = Boolean(data.isAdmin || userTags.includes(TAG_IDS.staff));
        const isManager = Boolean(data.isManager || userTags.includes(TAG_IDS.manager));

        // Revoke admin hub access if staff privileges were revoked in backend
        if (!isStaff && !isManager) {
            alert('Your moderation access has been revoked.');
            window.location.href = 'main.html';
            return;
        }

        const updatedUser = {
            ...user,
            ...data,
            tags: userTags,
            isAdmin: isStaff,
            isManager: isManager,
            role: isStaff ? 'administrator' : 'member'
        };

        currentUser = updatedUser;
        localStorage.setItem('kw_session', JSON.stringify(updatedUser));
        setupAdminProfile();
    } catch (err) {
        console.error('Error syncing background session:', err);
    }
}

function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const str = urlOrId.trim();
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
    const match = str.match(ytRegex);
    if (match && match[1]) return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return str;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeAttr(str) {
    return escapeHtml(str).replace(/"/g, '&quot;');
}

function escapeUrl(url) {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : '#';
    } catch {
        return '#';
    }
}