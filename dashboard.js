// dashboard.js - Comprehensive Admin Management System (Moderation, Catalog, Users, Metrics)

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

// Global Data States
let currentUser = null;
let allSongs = [];
let allUsers = [];
let pendingQueue = [];

// Filtering & Sorting State
let userSearchQuery = '';
let userRoleFilter = 'all';
let songSearchQuery = '';
let songSortBy = 'title';
let pendingSearchQuery = '';

// Discord Forum Tag IDs for Moderation & RBAC
const TAG_IDS = {
    management: '1549308000664031323',
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027',
    manager: '1549308000664031323'
};

// ==========================================
// 1. INITIALIZATION & SESSION GOVERNANCE
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Refresh and validate session data against backend in real-time
    console.log("REFRESH EVENT FIRED!")
    refreshUserSession();

    const sessionData = localStorage.getItem('kw_session');
    
    // 2. Session check: Must be authenticated
    if (!sessionData) {
        window.location.href = 'index.html';
        return;
    }

    try {
        currentUser = JSON.parse(sessionData);
    } catch (e) {
        localStorage.removeItem('kw_session');
        window.location.href = 'index.html';
        return;
    }

    // 3. Admin authorization check: Ensure administrative status
    if (!currentUser.isAdmin) {
        alert('Access denied. Administrator privileges required.');
        window.location.href = 'main.html';
        return;
    }

    // 4. Setup Global UI Elements & Global Event Listeners
    setupUserProfile();
    bindGlobalEventListeners();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 5. Hydrate all admin management datasets
    await Promise.all([
        loadPendingRequests(),
        loadUserList(),
        loadSongs()
    ]);
});

function bindGlobalEventListeners() {
    // Form submission handlers
    const addTrackForm = document.getElementById('add-track-form');
    if (addTrackForm) {
        addTrackForm.addEventListener('submit', window.addTrackDirectly);
    }

    const editTrackForm = document.getElementById('edit-track-form');
    if (editTrackForm) {
        editTrackForm.addEventListener('submit', window.updateTrackDirectly);
    }

    // Keyboard shortcuts (ESC closes open modals)
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeAddTrackModal();
            closeEditTrackModal();
            closePreviewModal();
        }
    });
}

function setupUserProfile() {
    const displayName = document.getElementById('user-display-name');
    const avatar = document.getElementById('user-avatar');

    if (displayName) displayName.textContent = currentUser.username;
    
    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${escapeHtml(currentUser.avatarUrl)}" alt="Avatar" class="w-full h-full object-cover">`;
        } else {
            avatar.textContent = (currentUser.username || 'A').charAt(0).toUpperCase();
        }
    }
}

// Navigation Tab Switcher
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const activeSection = document.getElementById(`content-${tabName}`);
    if (activeSection) activeSection.classList.remove('hidden');

    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    hideDashboardAlert();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
};

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = 'index.html';
};

async function refreshUserSession() {
    console.log("refreshUserSession Fired")
    const sessionData = localStorage.getItem('kw_session');
    const managerPage = document.getElementById('tab-management');
    if (!sessionData) return;

    try {
        const user = JSON.parse(sessionData);
        
        // Ping your worker endpoint to get the freshest tags/status from Discord
        const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, password: user.password })
        });

        if (!response.ok) {
            // If account was deleted or worker errors out, clear session
            localStorage.removeItem('kw_session');
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();
        const userTags = data.tags || [];

        // Check if blacklisted or locked in real time
        if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
            localStorage.removeItem('kw_session');
            alert('Your account has been restricted or blacklisted.');
            window.location.href = 'index.html';
            return;
        }

        // Recalculate staff status dynamically
        const isStaff = Boolean(
            data.isAdmin || userTags.includes(TAG_IDS.staff)
        );

        const isManager = Boolean(
            data.isManager || userTags.includes(TAG_IDS.manager)
        );

        // Update local session data with fresh tags and roles while maintaining password
        user.tags = userTags;
        user.isAdmin = isStaff;
        user.isManager = isManager;
        user.role = isStaff ? 'administrator' : 'member';

        if (isStaff) {
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Moderator'
            }
        }

        if (isManager) {
            user.role = 'manager';
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Manager'
            }
            if (managerPage) {
                managerPage.classList.remove('hidden');
            }
        };
        
        localStorage.setItem('kw_session', JSON.stringify(user));

    } catch (err) {
        console.error('Failed to sync session background state:', err);
    }
}

// Alert banner notifications
function showDashboardAlert(message, type = 'error') {
    const alertBox = document.getElementById('dashboard-alert');
    const alertText = document.getElementById('dashboard-alert-text');
    const alertIcon = document.getElementById('dashboard-alert-icon');

    if (!alertBox) return;

    alertBox.classList.remove(
        'hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400',
        'bg-green-500/10', 'border-green-500/20', 'text-green-400',
        'bg-sky-500/10', 'border-sky-500/20', 'text-sky-400'
    );

    if (type === 'error') {
        alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
        if (alertIcon) alertIcon.setAttribute('data-lucide', 'alert-circle');
    } else if (type === 'success') {
        alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
        if (alertIcon) alertIcon.setAttribute('data-lucide', 'check-circle');
    } else {
        alertBox.classList.add('bg-sky-500/10', 'border-sky-500/20', 'text-sky-400');
        if (alertIcon) alertIcon.setAttribute('data-lucide', 'info');
    }

    if (alertText) alertText.textContent = message;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.hideDashboardAlert = function() {
    const alertBox = document.getElementById('dashboard-alert');
    if (alertBox) alertBox.classList.add('hidden');
};


// ==========================================
// 2. PENDING QUEUE MODERATION SYSTEM
// ==========================================

async function loadPendingRequests() {
    const tableBody = document.getElementById('request-table-body');
    const badge = document.getElementById('pending-badge');
    const statPending = document.getElementById('stat-pending-count');

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/pending-tracks`);
        if (!response.ok) throw new Error('Failed to load pending queue.');

        pendingQueue = await response.json();
        
        if (badge) badge.textContent = pendingQueue.length;
        if (statPending) statPending.textContent = pendingQueue.length;

        renderPendingRequests(pendingQueue);

    } catch (err) {
        console.error(err);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-red-400 text-xs">Unable to load pending requests.</td></tr>`;
        }
    }
}

function renderPendingRequests(queue) {
    const tableBody = document.getElementById('request-table-body');
    if (!tableBody) return;

    const filtered = queue.filter(req => {
        const q = pendingSearchQuery.toLowerCase();
        return (
            (req.songName || req.title || '').toLowerCase().includes(q) ||
            (req.artist || '').toLowerCase().includes(q) ||
            (req.submittedBy || '').toLowerCase().includes(q)
        );
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                    <i data-lucide="check-check" class="w-8 h-8 mx-auto text-green-500/50 mb-2"></i>
                    <p class="text-xs font-semibold">No pending track requests found.</p>
                </td>
            </tr>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    tableBody.innerHTML = filtered.map(req => {
        const reqId = escapeAttr(req.id || req._id || '');
        const title = req.songName || req.title || 'Untitled';
        const artist = req.artist || 'Unknown';
        const videoId = req.videoId || '';
        const rawUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
        const submittedBy = req.submittedBy || 'Guest';
        const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';

        return `
            <tr class="hover:bg-white/[0.02] transition-all border-b border-white/5">
                <td class="px-6 py-4">
                    <div class="font-bold text-white text-sm">${escapeHtml(title)}</div>
                    <div class="text-xs text-slate-400">${escapeHtml(artist)}</div>
                </td>
                <td class="px-6 py-4">
                    <div class="flex items-center gap-2">
                        <button onclick="openPreviewModal('${escapeAttr(videoId)}', '${escapeAttr(title)}', '${escapeAttr(artist)}')" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 text-xs font-medium transition-all">
                            <i data-lucide="play" class="w-3.5 h-3.5"></i> Preview
                        </button>
                        <a href="${escapeHtml(rawUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 px-2 py-1 text-slate-400 hover:text-white text-xs transition-all">
                            <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                        </a>
                    </div>
                </td>
                <td class="px-6 py-4 text-xs text-slate-300 font-medium">
                    ${escapeHtml(submittedBy)}
                </td>
                <td class="px-6 py-4 text-xs text-slate-500">
                    ${dateStr}
                </td>
                <td class="px-6 py-4 text-right space-x-2 whitespace-nowrap">
                    <button onclick="approveTrack('${reqId}')" id="btn-approve-${reqId}" class="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                    </button>
                    <button onclick="rejectTrack('${reqId}')" id="btn-reject-${reqId}" class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Reject
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.filterPendingRequests = function(query) {
    pendingSearchQuery = query || '';
    renderPendingRequests(pendingQueue);
};

window.approveTrack = async function(trackId) {
    const btn = document.getElementById(`btn-approve-${trackId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Approving...';
    }

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/approve-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId })
        });

        if (!res.ok) throw new Error('Failed to approve track');

        showDashboardAlert('Track approved and added to catalog!', 'success');
        await loadPendingRequests();
        await loadSongs();
    } catch (err) {
        showDashboardAlert('Error approving track. Please try again.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Approve';
        }
    }
};

window.rejectTrack = async function(trackId) {
    if (!confirm('Are you sure you want to reject this track request?')) return;

    const btn = document.getElementById(`btn-reject-${trackId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Rejecting...';
    }

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/reject-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId })
        });

        if (!res.ok) throw new Error('Failed to reject track');

        showDashboardAlert('Track request rejected and deleted.', 'success');
        await loadPendingRequests();
    } catch (err) {
        showDashboardAlert('Error rejecting track. Please try again.', 'error');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Reject';
        }
    }
};

window.approveAllPending = async function() {
    if (pendingQueue.length === 0) {
        showDashboardAlert('No pending tracks to approve.', 'info');
        return;
    }

    if (!confirm(`Are you sure you want to approve all ${pendingQueue.length} pending tracks?`)) return;

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/approve-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error('Failed bulk approval');

        showDashboardAlert('All pending tracks approved successfully!', 'success');
        await loadPendingRequests();
        await loadSongs();
    } catch (err) {
        showDashboardAlert('Error processing bulk approval.', 'error');
    }
};


// ==========================================
// 3. LIVE SONG CATALOG & CRUD MANAGEMENT
// ==========================================

async function loadSongs() {
    const container = document.getElementById('song-list');
    const songsBadge = document.getElementById('songs-badge');
    const statSongs = document.getElementById('stat-songs-count');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error('Failed to fetch songs');

        allSongs = await response.json();

        if (songsBadge) songsBadge.textContent = allSongs.length;
        if (statSongs) statSongs.textContent = allSongs.length;

        renderSongs(allSongs);
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No approved songs loaded.</p>`;
    }
}

function renderSongs(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    // Apply Search Filter
    let filtered = songs.filter(s => {
        const q = songSearchQuery.toLowerCase();
        return (
            (s.songName || s.title || '').toLowerCase().includes(q) ||
            (s.artist || '').toLowerCase().includes(q) ||
            (s.submittedBy || '').toLowerCase().includes(q)
        );
    });

    // Apply Sorting
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
        return;
    }

    container.innerHTML = filtered.map(song => {
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
                        <button onclick="copyVRUrl('${escapeAttr(playUrl)}')" class="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs">
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

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.filterSongs = function(query) {
    songSearchQuery = query || '';
    renderSongs(allSongs);
};

window.sortSongs = function(sortBy) {
    songSortBy = sortBy || 'title';
    renderSongs(allSongs);
};

// --- Track Creation Modal ---
window.openAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.remove('hidden');
        resetModalStatus('modal-status-message');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.closeAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.add('hidden');
        const form = document.getElementById('add-track-form');
        if (form) form.reset();
        resetModalStatus('modal-status-message');
    }
};

window.addTrackDirectly = async function(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById('add-song-title');
    const artistInput = document.getElementById('add-song-artist');
    const videoIdInput = document.getElementById('add-song-videoid');
    const submitBtn = document.getElementById('btn-add-song');

    const songName = titleInput ? titleInput.value.trim() : '';
    const artist = artistInput ? artistInput.value.trim() : '';
    const videoId = videoIdInput ? extractVideoId(videoIdInput.value.trim()) : '';

    if (!songName || !artist || !videoId) {
        showModalError('modal-status-message', 'Please provide valid Title, Artist, and YouTube Video ID/URL.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Adding...';
    }

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/add-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songName,
                artist,
                videoId,
                submittedBy: currentUser ? currentUser.username : 'Admin'
            })
        });

        if (!res.ok) throw new Error('Failed to add track');

        showDashboardAlert('Track added directly to the catalog!', 'success');
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
        if (videoIdInput) videoIdInput.value = '';

        closeAddTrackModal();
        await loadSongs();

    } catch (err) {
        showModalError('modal-status-message', 'Failed to add track. Check connectivity.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Track';
        }
    }
};

// - HALF 

// --- Track Editing Modal ---
window.openEditTrackModal = function(songId) {
    const song = allSongs.find(s => String(s.id || s._id) === String(songId));
    if (!song) {
        showDashboardAlert('Song not found for editing.');
        return;
    }

    const editId = document.getElementById('edit-song-id');
    const editTitle = document.getElementById('edit-song-title');
    const editArtist = document.getElementById('edit-song-artist');
    const editVideoId = document.getElementById('edit-song-videoid');
    const modal = document.getElementById('edit-track-modal');

    if (editId) editId.value = songId;
    if (editTitle) editTitle.value = song.songName || song.title || '';
    if (editArtist) editArtist.value = song.artist || '';
    if (editVideoId) editVideoId.value = song.videoId || '';

    if (modal) {
        modal.classList.remove('hidden');
        resetModalStatus('edit-modal-status-message');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.closeEditTrackModal = function() {
    const modal = document.getElementById('edit-track-modal');
    if (modal) {
        modal.classList.add('hidden');
        resetModalStatus('edit-modal-status-message');
    }
};

window.updateTrackDirectly = async function(event) {
    if (event) event.preventDefault();

    const songId = document.getElementById('edit-song-id')?.value;
    const songName = document.getElementById('edit-song-title')?.value.trim();
    const artist = document.getElementById('edit-song-artist')?.value.trim();
    const rawVideoId = document.getElementById('edit-song-videoid')?.value.trim();
    const videoId = extractVideoId(rawVideoId);
    const submitBtn = document.getElementById('btn-save-song');

    if (!songId || !songName || !artist || !videoId) {
        showModalError('edit-modal-status-message', 'All fields are required.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/update-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId, songName, artist, videoId })
        });

        if (!res.ok) throw new Error('Failed to update track');

        showDashboardAlert('Song updated successfully!', 'success');
        closeEditTrackModal();
        await loadSongs();

    } catch (err) {
        showModalError('edit-modal-status-message', 'Error updating track.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
};

window.deleteSong = async function(songId) {
    if (!songId) {
        showDashboardAlert('Cannot delete track: Missing song ID.');
        return;
    }

    if (!confirm('Are you sure you want to remove this song from the live catalog?')) return;

    const btn = document.getElementById(`btn-delete-${songId}`);
    if (btn) {
        btn.disabled = true;
    }

    try {
        const res = await fetch(`${WORKER_BASE_URL}/api/admin/delete-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId })
        });

        if (!res.ok) throw new Error('Failed to delete song');

        showDashboardAlert('Song removed from live catalog successfully!', 'success');
        await loadSongs();
    } catch (err) {
        showDashboardAlert('Error deleting song. Please try again.', 'error');
        if (btn) btn.disabled = false;
    }
};


// ==========================================
// 4. USER MODERATION & ROLE MANAGEMENT
// ==========================================

async function loadUserList() {
    const userContainer = document.getElementById('user-list');
    const usersBadge = document.getElementById('users-badge');
    const statUsers = document.getElementById('stat-users-count');
    if (!userContainer) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/users`);
        if (!response.ok) throw new Error('Failed to load user list');

        allUsers = await response.json();

        if (usersBadge) usersBadge.textContent = allUsers.length;
        if (statUsers) statUsers.textContent = allUsers.length;

        renderUserList(allUsers);
        renderManagementList(allUsers);
    } catch (err) {
        console.error(err);
        userContainer.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">User management service unavailable.</p>`;
    }
}

function renderUserList(users) {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

    // Filter Users by Search Query & Role Filter
    const filtered = users.filter(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const q = userSearchQuery.toLowerCase();
        
        const matchesQuery = (
            (u.username || '').toLowerCase().includes(q) ||
            (u.threadId || '').toLowerCase().includes(q)
        );

        const isManagement = Boolean(
            (u.role && u.role.toLowerCase() === 'manager') ||
            (TAG_IDS.manager && userTags.includes(TAG_IDS.manager))
        );
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff))
        );
        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        if (!matchesQuery) return false;

        if (userRoleFilter === 'manager') return isManagement;
        if (userRoleFilter === 'staff') return isStaff;
        if (userRoleFilter === 'banned') return isBlacklisted;
        if (userRoleFilter === 'restricted') return isRestricted;

        return true;
    });

    if (filtered.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user accounts found matching constraints.</p>`;
        return;
    }

    userContainer.innerHTML = filtered.map(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const threadId = escapeAttr(u.threadId || '');
        
        const isManagement = Boolean(
            (u.role && u.role.toLowerCase() === 'manager') ||
            (TAG_IDS.manager && userTags.includes(String(TAG_IDS.manager)))
        );
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff))
        );

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${isManagement ? '<span class="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">Management</span>' : ''}
                            ${isStaff ? '<span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Staff</span>' : ''}
                            ${isBlacklisted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Banned</span>' : ''}
                            ${isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-500">Thread ID: ${escapeHtml(u.threadId || 'N/A')}</p>
                </div>

                <div class="flex items-center gap-2 pt-3 border-t border-white/5 flex-wrap">
                    ${isStaff ? `

                    ` : `
                        <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.restricted}', ${!isRestricted})" class="flex-1 py-1.5 px-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-xs font-bold transition-all">
                            ${isRestricted ? 'Unrestrict' : 'Restrict'}
                        </button>
                        <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.blacklisted}', ${!isBlacklisted})" class="flex-1 py-1.5 px-2 ${isBlacklisted ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'} border rounded-lg text-xs font-bold transition-all">
                            ${isBlacklisted ? 'Unban' : 'Blacklist'}
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderManagementList(users) {
    const userContainer = document.getElementById('management-user-list');
    if (!userContainer) return;

    // Filter Users by Search Query & Role Filter
    let total = 0;
    const filtered = users.filter(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const q = userSearchQuery.toLowerCase();
        
        const matchesQuery = (
            (u.username || '').toLowerCase().includes(q) ||
            (u.threadId || '').toLowerCase().includes(q)
        );

        const isManagement = Boolean(
            (u.role && u.role.toLowerCase() === 'manager') ||
            (TAG_IDS.manager && userTags.includes(TAG_IDS.manager))
        );
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff))
        );

        let added = false;
        if (isManagement) {
            added = true;
            total++;
        };

        if (isStaff) {
            if (added == false){
                total++;
            }
        }
        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        if (!matchesQuery) return false;

        if (userRoleFilter === 'manager') return isManagement;
        if (userRoleFilter === 'staff') return isStaff;
        if (userRoleFilter === 'banned') return isBlacklisted;
        if (userRoleFilter === 'restricted') return isRestricted;

        return true;
    });

    if (filtered.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user accounts found matching constraints.</p>`;
        return;
    }

    userContainer.innerHTML = filtered.map(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const threadId = escapeAttr(u.threadId || '');
        
        const isManagement = Boolean(
            (u.role && u.role.toLowerCase() === 'manager') ||
            (TAG_IDS.manager && userTags.includes(String(TAG_IDS.manager)))
        );
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff))
        );

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${isManagement ? '<span class="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">Management</span>' : ''}
                            ${isStaff ? '<span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Staff</span>' : ''}
                            ${isBlacklisted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Banned</span>' : ''}
                            ${isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-500">Thread ID: ${escapeHtml(u.threadId || 'N/A')}</p>
                </div>

                <div class="flex items-center gap-2 pt-3 border-t border-white/5 flex-wrap">
                    ${isStaff ? `
                        <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.staff}', false)" class="flex-1 py-1.5 px-2 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs font-bold transition-all">
                            Remove Staff
                        </button>
                    ` : `
                        <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.staff}', true)" class="flex-1 py-1.5 px-2 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg text-xs font-bold transition-all">
                            Give Staff
                        </button>
                    `}
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') lucide.createIcons();

    const mainTotalUsers = document.getElementById('stat-staff-count')

    if (mainTotalUsers) {
        mainTotalUsers.textContent = total;
    };
}

window.filterUsers = function(query) {
    userSearchQuery = query || '';
    renderUserList(allUsers);
};

window.filterUsersByRole = function(role) {
    userRoleFilter = role || 'all';
    renderUserList(allUsers);
};

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    if (!threadId) {
        showDashboardAlert('Cannot alter user: Missing Thread ID.');
        return;
    }

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tagId, add: shouldAdd })
        });
        if (!response.ok) throw new Error('Failed to update user tag state');

        showDashboardAlert('User authorization status updated.', 'success');
        await loadUserList();
    } catch (err) {
        showDashboardAlert('Failed to update user status.', 'error');
    }
};


// ==========================================
// 5. UTILITY & MEDIA PREVIEW HELPERS
// ==========================================

window.openPreviewModal = function(videoId, title, artist) {
    let modal = document.getElementById('preview-track-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'preview-track-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }

    const embedUrl = `https://www.youtube.com/embed/${extractVideoId(videoId)}?autoplay=1`;

    modal.innerHTML = `
        <div class="glass w-full max-w-2xl rounded-2xl border border-white/10 p-6 relative flex flex-col gap-4">
            <div class="flex items-center justify-between">
                <div>
                    <h3 class="font-bold text-white text-base">${escapeHtml(title)}</h3>
                    <p class="text-xs text-slate-400">${escapeHtml(artist)}</p>
                </div>
                <button onclick="closePreviewModal()" class="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all">
                    <i data-lucide="x" class="w-4 h-4"></i>
                </button>
            </div>
            <div class="aspect-video w-full rounded-xl overflow-hidden bg-black border border-white/10">
                <iframe class="w-full h-full" src="${embedUrl}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
            </div>
        </div>
    `;

    modal.classList.remove('hidden');
    if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.closePreviewModal = function() {
    const modal = document.getElementById('preview-track-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.innerHTML = '';
    }
};

window.copyVRUrl = function(url) {
    if (!url || url === '#') {
        showDashboardAlert('Invalid URL for this track.');
        return;
    }
    navigator.clipboard.writeText(url).then(() => {
        showDashboardAlert('Track URL copied to clipboard!', 'success');
    }).catch(() => {
        showDashboardAlert('Failed to copy URL.');
    });
};

function extractVideoId(urlOrId) {
    if (!urlOrId) return '';
    if (!urlOrId.includes('http') && !urlOrId.includes('youtube.com') && !urlOrId.includes('youtu.be')) {
        return urlOrId;
    }
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = urlOrId.match(regExp);
    return (match && match[2].length === 11) ? match[2] : urlOrId;
}

function resetModalStatus(elementId) {
    const statusBox = document.getElementById(elementId);
    if (statusBox) {
        statusBox.classList.add('hidden');
        statusBox.textContent = '';
    }
}

function showModalError(elementId, message) {
    const statusBox = document.getElementById(elementId);
    if (statusBox) {
        statusBox.className = 'p-3 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-4';
        statusBox.textContent = message;
        statusBox.classList.remove('hidden');
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}