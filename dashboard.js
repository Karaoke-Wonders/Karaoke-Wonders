// dashboard.js - Dedicated logic for admin.html (Moderation, Approve/Reject, Users)

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

let currentUser = null;
let allSongs = [];
let pendingQueue = [];

// Discord Forum Tag IDs for moderation
const TAG_IDS = {
    staff: '1547672021364768848',
    restricted: '1547672052750884864',
    blacklisted: '1547672075395792947'
};

document.addEventListener('DOMContentLoaded', () => {
    const sessionData = localStorage.getItem('kw_session');
    
    // 1. Session check: Must be logged in
    if (!sessionData) {
        window.location.href = 'index.html';
        return;
    }

    currentUser = JSON.parse(sessionData);

    // 2. Admin authorization check: If not admin, redirect to member stage
    if (!currentUser.isAdmin) {
        alert('Access denied. Admin privileges required.');
        window.location.href = 'main.html';
        return;
    }

    setupUserProfile();
    lucide.createIcons();

    // 3. Load all admin moderation datasets
    loadPendingRequests();
    loadUserList();
    loadSongs();
});

function setupUserProfile() {
    const displayName = document.getElementById('user-display-name');
    const avatar = document.getElementById('user-avatar');

    if (displayName) displayName.textContent = currentUser.username;
    
    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${currentUser.avatarUrl}" alt="Avatar" class="w-full h-full object-cover">`;
        } else {
            avatar.textContent = currentUser.username.charAt(0).toUpperCase();
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
    lucide.createIcons();
};

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = 'index.html';
};

// Alert banner notifications
function showDashboardAlert(message, type = 'error') {
    const alertBox = document.getElementById('dashboard-alert');
    const alertText = document.getElementById('dashboard-alert-text');
    const alertIcon = document.getElementById('dashboard-alert-icon');

    if (!alertBox) return;

    alertBox.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400', 'bg-sky-500/10', 'border-sky-500/20', 'text-sky-400');

    if (type === 'error') {
        alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
        alertIcon.setAttribute('data-lucide', 'alert-circle');
    } else if (type === 'success') {
        alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
        alertIcon.setAttribute('data-lucide', 'check-circle');
    } else {
        alertBox.classList.add('bg-sky-500/10', 'border-sky-500/20', 'text-sky-400');
        alertIcon.setAttribute('data-lucide', 'info');
    }

    alertText.textContent = message;
    lucide.createIcons();
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
            lucide.createIcons();
            return;
        }

        tableBody.innerHTML = pendingQueue.map(req => {
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
                        <button onclick="approveTrack('${req.id}')" id="btn-approve-${req.id}" class="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                            <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                        </button>
                        <button onclick="rejectTrack('${req.id}')" id="btn-reject-${req.id}" class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Reject
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        lucide.createIcons();

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

        showDashboardAlert('Track approved and published to GitHub library!', 'success');
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

        const users = await response.json();

        if (usersBadge) usersBadge.textContent = users.length;
        if (statUsers) statUsers.textContent = users.length;

        if (users.length === 0) {
            userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user forum accounts found.</p>`;
            return;
        }

        userContainer.innerHTML = users.map(u => {
            const isBlacklisted = (u.tags || []).includes(TAG_IDS.blacklisted) || u.isLocked;
            const isRestricted = (u.tags || []).includes(TAG_IDS.restricted);
            const isStaff = (u.tags || []).includes(TAG_IDS.staff);

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
                        <p class="text-[11px] text-slate-500">Thread ID: ${u.threadId || 'N/A'}</p>
                    </div>

                    <div class="flex items-center gap-2 pt-3 border-t border-white/5">
                        <button onclick="toggleUserTag('${u.threadId}', '${TAG_IDS.restricted}', ${!isRestricted})" class="flex-1 py-1.5 px-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-xs font-bold transition-all">
                            ${isRestricted ? 'Unrestrict' : 'Restrict'}
                        </button>
                        <button onclick="toggleUserTag('${u.threadId}', '${TAG_IDS.blacklisted}', ${!isBlacklisted})" class="flex-1 py-1.5 px-2 ${isBlacklisted ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'} border rounded-lg text-xs font-bold transition-all">
                            ${isBlacklisted ? 'Unban' : 'Blacklist'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        userContainer.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">User management service unavailable.</p>`;
    }
}

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tagId, add: shouldAdd })
        });
        if (!response.ok) throw new Error('Failed to update tag');

        showDashboardAlert('User access status updated.', 'success');
        loadUserList();
    } catch (err) {
        showDashboardAlert('Failed to update user tag.', 'error');
    }
};

// ==========================================
// 3. LIVE APPROVED SONGS OVERVIEW
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
                <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                    <span class="text-slate-500 text-[11px]">Added by ${escapeHtml(uploader)}</span>
                    <button onclick="copyVRUrl('${escapeHtml(playUrl)}')" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 border border-white/10">
                        <i data-lucide="copy" class="w-3.5 h-3.5 text-green-400"></i> Copy URL
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

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