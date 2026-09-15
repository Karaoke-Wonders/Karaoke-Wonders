// dashboard.js - Dedicated logic for admin.html (Moderation, Approve/Reject, Users, Songs)

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

let currentUser = null;
let allSongs = [];
let allUsers = [];
let pendingQueue = [];

// Discord Forum Tag IDs for moderation
const TAG_IDS = {
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027'
};

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Refresh and validate session data against Discord/Worker in real time first
    await refreshUserSession();

    const sessionData = localStorage.getItem('kw_session');
    
    // 2. Session check: Must be logged in
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

    // 3. Admin authorization check: If not admin, redirect to member stage
    if (!currentUser.isAdmin) {
        alert('Access denied. Admin privileges required.');
        window.location.href = 'main.html';
        return;
    }

    setupUserProfile();
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 4. Load all admin moderation datasets
    await loadPendingRequests();
    await loadUserList();
    await loadSongs();
});

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

// Tab switcher logic
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
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) return;

    try {
        const user = JSON.parse(sessionData);
        
        // Ping worker endpoint to get freshest tags/status from Discord
        const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: user.username, password: user.password })
        });

        if (!response.ok) {
            localStorage.removeItem('kw_session');
            window.location.href = 'index.html';
            return;
        }

        const data = await response.json();
        const userTags = (data.tags || []).map(tag => String(tag));

        // Check if blacklisted or locked in real time
        if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
            localStorage.removeItem('kw_session');
            alert('Your account has been restricted or blacklisted.');
            window.location.href = 'index.html';
            return;
        }

        // Recalculate staff status dynamically
        const isStaff = Boolean(
            data.isAdmin || 
            userTags.includes(TAG_IDS.staff) || 
            (user.username && user.username.toLowerCase().includes('admin'))
        );

        // Update local session data with fresh tags and roles while maintaining credentials
        user.tags = userTags;
        user.isAdmin = isStaff;
        user.role = isStaff ? 'administrator' : 'member';
        
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
// 1. PENDING QUEUE (LOAD, APPROVE, REJECT)
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

        if (!tableBody) return;

        if (pendingQueue.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="px-6 py-12 text-center text-slate-500">
                        <i data-lucide="check-check" class="w-8 h-8 mx-auto text-green-500/50 mb-2"></i>
                        <p class="text-xs font-semibold">Queue is clear! No tracks pending review.</p>
                    </td>
                </tr>
            `;
            if (typeof lucide !== 'undefined') lucide.createIcons();
            return;
        }

        tableBody.innerHTML = pendingQueue.map(req => {
            const reqId = escapeAttr(req.id || '');
            const title = req.songName || req.title || 'Untitled';
            const artist = req.artist || 'Unknown';
            const videoId = req.videoId || '';
            const youtubeUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
            const submittedBy = req.submittedBy || 'Guest';
            const dateStr = req.createdAt ? new Date(req.createdAt).toLocaleDateString() : 'N/A';

            return `
                <tr class="hover:bg-white/[0.02] transition-all">
                    <td class="px-6 py-4">
                        <div class="font-bold text-white text-sm">${escapeHtml(title)}</div>
                        <div class="text-xs text-slate-400">${escapeHtml(artist)}</div>
                    </td>
                    <td class="px-6 py-4">
                        <a href="${escapeHtml(youtubeUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sky-400 text-xs font-medium transition-all">
                            <i data-lucide="youtube" class="w-3.5 h-3.5 text-red-400"></i>
                            <span>Watch</span>
                        </a>
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

    } catch (err) {
        console.error(err);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="5" class="px-6 py-6 text-center text-red-400 text-xs">Unable to load pending requests.</td></tr>`;
        }
    }
}

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

        showDashboardAlert('Track approved successfully!', 'success');
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
    if (!confirm('Are you sure you want to reject and remove this track request?')) return;

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

// ==========================================
// 2. USER MODERATION & ACCESS CONTROL
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
    } catch (err) {
        console.error(err);
        userContainer.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">User management service unavailable.</p>`;
    }
}

function renderUserList(users) {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

    if (users.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user forum accounts found.</p>`;
        return;
    }

    userContainer.innerHTML = users.map(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const threadId = escapeAttr(u.threadId || '');
        
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff)) ||
            (u.username && u.username.toLowerCase().includes('admin'))
        );

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        <div class="flex items-center gap-1.5">
                            ${isStaff ? '<span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Staff</span>' : ''}
                            ${isBlacklisted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Banned</span>' : ''}
                            ${isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-500">Thread ID: ${escapeHtml(u.threadId || 'N/A')}</p>
                </div>

                <div class="flex items-center gap-2 pt-3 border-t border-white/5">
                    ${isStaff ? `
                        <div class="w-full text-center py-1 px-3 bg-slate-800/40 border border-slate-700/50 rounded-lg">
                            <span class="text-[11px] text-slate-400 font-semibold flex items-center justify-center gap-1.5">
                                <i data-lucide="shield-alert" class="w-3.5 h-3.5 text-purple-400"></i> Staff Actions Protected
                            </span>
                        </div>
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

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.filterUsers = function(query) {
    const q = (query || '').toLowerCase();
    const filtered = allUsers.filter(u => 
        (u.username || '').toLowerCase().includes(q) ||
        (u.threadId || '').toLowerCase().includes(q)
    );
    renderUserList(filtered);
};

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tagId, add: shouldAdd })
        });
        if (!response.ok) throw new Error('Failed to update tag');

        showDashboardAlert('User access status updated.', 'success');
        await loadUserList();
    } catch (err) {
        showDashboardAlert('Failed to update user tag.', 'error');
    }
};

// Modal helpers
window.openAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.remove('hidden');
        resetModalStatus();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
};

window.closeAddTrackModal = function() {
    const modal = document.getElementById('add-track-modal');
    if (modal) {
        modal.classList.add('hidden');
        const form = document.getElementById('add-track-form');
        if (form) form.reset();
        resetModalStatus();
    }
};

function resetModalStatus() {
    const statusBox = document.getElementById('modal-status-message');
    if (statusBox) {
        statusBox.classList.add('hidden');
        statusBox.textContent = '';
    }
}

function showModalError(message) {
    const statusBox = document.getElementById('modal-status-message');
    if (statusBox) {
        statusBox.className = 'p-3 text-xs font-semibold rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-4';
        statusBox.textContent = message;
        statusBox.classList.remove('hidden');
    }
}

// Single consolidated Handler for direct track addition via Modal / Admin form
window.addTrackDirectly = async function(event) {
    if (event) event.preventDefault();

    const titleInput = document.getElementById('add-song-title');
    const artistInput = document.getElementById('add-song-artist');
    const videoIdInput = document.getElementById('add-song-videoid');
    const submitBtn = document.getElementById('btn-add-song');

    const songName = titleInput ? titleInput.value.trim() : '';
    const artist = artistInput ? artistInput.value.trim() : '';
    const videoId = videoIdInput ? videoIdInput.value.trim() : '';

    if (!songName || !artist || !videoId) {
        showModalError('Please fill out Title, Artist, and Video ID / URL.');
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

        showDashboardAlert('Track added directly to the live catalog!', 'success');

        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
        if (videoIdInput) videoIdInput.value = '';

        closeAddTrackModal();
        await loadSongs();

    } catch (err) {
        showModalError('Failed to add track directly. Please check connection and try again.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Track';
        }
    }
};

// ==========================================
// 3. LIVE APPROVED SONGS OVERVIEW & MANAGEMENT
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

    if (songs.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No matching songs found.</p>`;
        return;
    }

    container.innerHTML = songs.map(song => {
        const songId = escapeAttr(song.id || song._id || '');
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const videoId = song.videoId || '';
        const playUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;
        const escapedPlayUrl = escapeAttr(playUrl);

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
                        <button onclick="copyVRUrl('${escapedPlayUrl}')" class="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs">
                            <i data-lucide="copy" class="w-3.5 h-3.5 text-green-400"></i> Copy
                        </button>
                        <button onclick="deleteSong('${songId}')" id="btn-delete-${songId}" class="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all flex items-center gap-1 border border-red-500/20 text-xs">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Delete
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

window.deleteSong = async function(songId) {
    if (!songId) {
        showDashboardAlert('Cannot delete track: Missing song ID.');
        return;
    }

    if (!confirm('Are you sure you want to remove this song from the live catalog?')) return;

    const btn = document.getElementById(`btn-delete-${songId}`);
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Deleting...';
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
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Delete';
        }
    }
};

window.filterSongs = function(query) {
    const q = (query || '').toLowerCase();
    const filtered = allSongs.filter(s => 
        (s.songName || s.title || '').toLowerCase().includes(q) ||
        (s.artist || '').toLowerCase().includes(q) ||
        (s.submittedBy || '').toLowerCase().includes(q)
    );
    renderSongs(filtered);
};

window.copyVRUrl = function(url) {
    if (!url || url === '#') {
        showDashboardAlert('Invalid YouTube URL for this track.');
        return;
    }
    navigator.clipboard.writeText(url).then(() => {
        showDashboardAlert('Track URL copied to clipboard!', 'success');
    }).catch(() => {
        showDashboardAlert('Failed to copy track URL.');
    });
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}