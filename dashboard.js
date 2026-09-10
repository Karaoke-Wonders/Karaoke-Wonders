const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev/';

let currentUser = null;
let allSongs = [];

// Replace these with your actual Discord Forum Tag IDs from your server settings
const TAG_IDS = {
    staff: '1547672021364768848',
    restricted: '1547672052750884864',
    blacklisted: '1547672075395792947'
};

document.addEventListener('DOMContentLoaded', () => {
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) {
        window.location.href = '/index.html';
        return;
    }

    currentUser = JSON.parse(sessionData);

    setupUserProfile();
    lucide.createIcons();
    loadSongs();

    if (currentUser.isAdmin) {
        loadPendingRequests();
        loadUserList();
    }

    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleTrackSubmit);
    }
});

function setupUserProfile() {
    const displayName = document.getElementById('user-display-name');
    const roleBadge = document.getElementById('user-role-badge');
    const avatar = document.getElementById('user-avatar');
    const adminLinks = document.getElementById('admin-links');

    if (displayName) displayName.textContent = currentUser.username;
    
    // If the user has a Discord avatarUrl saved, render it as an image, otherwise fallback to letter
    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${currentUser.avatarUrl}" alt="Avatar" class="w-full h-full rounded-full object-cover">`;
        } else {
            avatar.textContent = currentUser.username.charAt(0).toUpperCase();
        }
    }

    if (currentUser.isAdmin) {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Administrator`;
        }
        if (adminLinks) adminLinks.classList.remove('hidden');
    } else {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> Member`;
        }
    }
}

window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const activeSection = document.getElementById(`content-${tabName}`);
    if (activeSection) activeSection.classList.remove('hidden');

    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    hideDashboardAlert();
};

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = '/index.html';
};

function showDashboardAlert(message, type = 'error') {
    const alertBox = document.getElementById('dashboard-alert');
    const alertText = document.getElementById('dashboard-alert-text');
    const alertIcon = document.getElementById('dashboard-alert-icon');

    if (!alertBox) return;

    alertBox.classList.remove('hidden', 'bg-red-500/10', 'border-red-500/20', 'text-red-400', 'bg-green-500/10', 'border-green-500/20', 'text-green-400');

    if (type === 'error') {
        alertBox.classList.add('bg-red-500/10', 'border-red-500/20', 'text-red-400');
        alertIcon.setAttribute('data-lucide', 'alert-circle');
    } else {
        alertBox.classList.add('bg-green-500/10', 'border-green-500/20', 'text-green-400');
        alertIcon.setAttribute('data-lucide', 'check-circle');
    }

    alertText.textContent = message;
    lucide.createIcons();
}

window.hideDashboardAlert = function() {
    const alertBox = document.getElementById('dashboard-alert');
    if (alertBox) alertBox.classList.add('hidden');
};

async function loadSongs() {
    const container = document.getElementById('song-list');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error('Failed to fetch library songs');

        allSongs = await response.json();
        renderSongs(allSongs);
    } catch (err) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 glass rounded-3xl border border-white/10">
                <i data-lucide="music" class="w-10 h-10 mx-auto text-slate-500 mb-3"></i>
                <p class="text-slate-400 text-sm">No songs found in the library yet.</p>
            </div>
        `;
        lucide.createIcons();
    }
}

function renderSongs(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    if (songs.length === 0) {
        container.innerHTML = `
            <div class="col-span-full text-center py-12 glass rounded-3xl border border-white/10">
                <p class="text-slate-400 text-sm">No matching songs found.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = songs.map(song => {
        const title = song.songName || song.title || 'Untitled';
        const videoId = song.videoId || '';
        const playUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : (song.url || '#');
        const uploader = song.submittedBy || song.uploader || 'Community';

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between hover:border-green-500/30 transition-all">
                <div>
                    <div class="flex items-start justify-between gap-2 mb-2">
                        <h3 class="font-bold text-base text-white line-clamp-1">${escapeHtml(title)}</h3>
                        <span class="px-2 py-0.5 text-[10px] uppercase font-bold rounded-md bg-green-500/20 text-green-400 border border-green-500/30">Karaoke</span>
                    </div>
                    <p class="text-xs text-slate-400 font-medium mb-4">By ${escapeHtml(song.artist || 'Unknown Artist')}</p>
                </div>
                <div class="pt-4 border-t border-white/10 flex items-center justify-between">
                    <span class="text-[11px] text-slate-500">Added by ${escapeHtml(uploader)}</span>
                    <button onclick="copyVRUrl('${escapeHtml(playUrl)}')" class="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-green-500 hover:text-black rounded-lg transition-all flex items-center gap-1.5">
                        <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy VRChat Link
                    </button>
                </div>
            </div>
        `;
    }).join('');

    lucide.createIcons();
}

window.copyVRUrl = function(url) {
    if (!url || url === '#') {
        showDashboardAlert('No valid YouTube URL available for this track.');
        return;
    }

    navigator.clipboard.writeText(url).then(() => {
        showDashboardAlert('Track URL copied to clipboard! Paste it into VRChat.', 'success');
    }).catch(() => {
        showDashboardAlert('Failed to copy track URL.');
    });
};

window.filterSongs = function() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const filtered = allSongs.filter(s => {
        const title = (s.songName || s.title || '').toLowerCase();
        const artist = (s.artist || '').toLowerCase();
        const uploader = (s.submittedBy || s.uploader || '').toLowerCase();

        return title.includes(query) || artist.includes(query) || uploader.includes(query);
    });
    renderSongs(filtered);
};

async function handleTrackSubmit(e) {
    e.preventDefault();

    const title = document.getElementById('track-title').value.trim();
    const artist = document.getElementById('track-artist').value.trim();
    const url = document.getElementById('track-url').value.trim();
    const submitBtn = document.getElementById('submit-track-btn');

    if (!title || !artist || !url) {
        showDashboardAlert('Please fill out all fields.');
        return;
    }

    let videoId = url;
    if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Submitting...</span>`;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/submit-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                songName: title,
                artist: artist,
                videoId: videoId,
                timestamp: 0,
                submittedBy: currentUser.username,
                threadId: currentUser.threadId
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to submit track.');
        }

        showDashboardAlert('Track submitted successfully! Pending moderation approval.', 'success');
        document.getElementById('upload-form').reset();

    } catch (err) {
        showDashboardAlert(err.message || 'An error occurred while submitting.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `<i data-lucide="send" class="w-4 h-4"></i><span>Submit to Moderation Queue</span>`;
        lucide.createIcons();
    }
}

async function loadPendingRequests() {
    const tableBody = document.getElementById('request-table-body');
    const badge = document.getElementById('pending-badge');
    if (!tableBody) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/pending-tracks`);
        if (!response.ok) throw new Error('Failed to load queue');

        const requests = await response.json();
        if (badge) badge.textContent = requests.length;

        if (requests.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-6 py-8 text-center text-slate-500 text-xs">No pending track requests in queue.</td>
                </tr>
            `;
            return;
        }

        tableBody.innerHTML = requests.map(req => {
            const title = req.songName || req.title || 'Untitled';
            return `
                <tr>
                    <td class="px-6 py-4">
                        <div class="font-bold text-white">${escapeHtml(title)}</div>
                        <div class="text-xs text-slate-400">${escapeHtml(req.artist)}</div>
                    </td>
                    <td class="px-6 py-4 text-xs text-slate-300">${escapeHtml(req.submittedBy)}</td>
                    <td class="px-6 py-4 text-xs text-slate-500">${new Date(req.createdAt).toLocaleDateString()}</td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button onclick="approveTrack('${req.id}')" class="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-bold transition-all">Approve</button>
                        <button onclick="rejectTrack('${req.id}')" class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-all">Reject</button>
                    </td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        if (badge) badge.textContent = '0';
        tableBody.innerHTML = `<tr><td colspan="4" class="px-6 py-4 text-center text-slate-500 text-xs">Queue empty or unavailable.</td></tr>`;
    }
}

window.approveTrack = async function(trackId) {
    try {
        await fetch(`${WORKER_BASE_URL}/api/admin/approve-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId })
        });
        showDashboardAlert('Track approved and added to library!', 'success');
        loadPendingRequests();
        loadSongs();
    } catch (err) {
        showDashboardAlert('Failed to approve track.');
    }
};

window.rejectTrack = async function(trackId) {
    try {
        await fetch(`${WORKER_BASE_URL}/api/admin/reject-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackId })
        });
        showDashboardAlert('Track request rejected.');
        loadPendingRequests();
    } catch (err) {
        showDashboardAlert('Failed to reject track.');
    }
};

async function loadUserList() {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/users`);
        if (!response.ok) throw new Error('Failed to load user list');

        const users = await response.json();
        userContainer.innerHTML = users.map(u => {
            const isBlacklisted = u.tags.includes(TAG_IDS.blacklisted);
            const isRestricted = u.tags.includes(TAG_IDS.restricted);

            return `
                <div class="glass p-5 rounded-2xl border border-white/10 flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                            ${isBlacklisted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Blacklisted</span>' : ''}
                            ${isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-500 mt-1">Thread ID: ${u.threadId || 'N/A'}</p>
                    </div>
                    <div class="flex gap-2">
                        <button onclick="toggleUserTag('${u.threadId}', '${TAG_IDS.restricted}', ${!isRestricted})" class="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg text-xs font-bold hover:opacity-80 transition-all">
                            ${isRestricted ? 'Unrestrict' : 'Restrict'}
                        </button>
                        <button onclick="toggleUserTag('${u.threadId}', '${TAG_IDS.blacklisted}', ${!isBlacklisted})" class="px-3 py-1.5 ${isBlacklisted ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} rounded-lg text-xs font-bold hover:opacity-80 transition-all">
                            ${isBlacklisted ? 'Unban' : 'Blacklist'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs">User management unavailable.</p>`;
    }
}

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    try {
        await fetch(`${WORKER_BASE_URL}/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, tagId, add: shouldAdd })
        });
        showDashboardAlert(`User status updated.`, 'success');
        loadUserList();
    } catch (err) {
        showDashboardAlert('Failed to update user tag status.');
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}