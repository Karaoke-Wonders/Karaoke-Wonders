// Worker API endpoint (Leave empty string if hosted on the same domain)
const WORKER_BASE_URL = 'https://api.karaokewonders.com';

let currentUser = null;
let allSongs = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Verify User Session
    const sessionData = localStorage.getItem('kw_session');
    if (!sessionData) {
        window.location.href = '/index.html';
        return;
    }

    currentUser = JSON.parse(sessionData);

    // 2. Initialize UI with User Info
    setupUserProfile();
    
    // 3. Initialize Lucide Icons
    lucide.createIcons();

    // 4. Fetch initial data
    loadSongs();
    if (currentUser.isAdmin) {
        loadPendingRequests();
        loadUserList();
    }

    // 5. Setup Form Listener for Submitting Tracks
    const uploadForm = document.getElementById('upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', handleTrackSubmit);
    }
});

// --- USER & NAVIGATION SETUP ---
function setupUserProfile() {
    const displayName = document.getElementById('user-display-name');
    const roleBadge = document.getElementById('user-role-badge');
    const avatar = document.getElementById('user-avatar');
    const adminLinks = document.getElementById('admin-links');

    if (displayName) displayName.textContent = currentUser.username;
    if (avatar) avatar.textContent = currentUser.username.charAt(0).toUpperCase();

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

// Tab Switching
window.switchTab = function(tabName) {
    // Hide all tab sections
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));

    // Remove active class from all sidebar links
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    // Show selected section
    const activeSection = document.getElementById(`content-${tabName}`);
    if (activeSection) activeSection.classList.remove('hidden');

    // Highlight selected nav button
    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    hideDashboardAlert();
};

window.logout = function() {
    localStorage.removeItem('kw_session');
    window.location.href = '/index.html';
};

// --- ALERT MESSAGING ---
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

window.hideAlert = function() {
    const alertBox = document.getElementById('dashboard-alert');
    if (alertBox) alertBox.classList.add('hidden');
};

// --- 1. SONG LIBRARY ---
async function loadSongs() {
    const container = document.getElementById('song-list');
    if (!container) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error('Failed to fetch library songs');

        allSongs = await response.json();
        renderSongs(allSongs);
    } catch (err) {
        // Fallback UI if API isn't populated yet
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

    container.innerHTML = songs.map(song => `
        <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between hover:border-green-500/30 transition-all">
            <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-bold text-base text-white line-clamp-1">${escapeHtml(song.title)}</h3>
                    <span class="px-2 py-0.5 text-[10px] uppercase font-bold rounded-md bg-green-500/20 text-green-400 border border-green-500/30">Karaoke</span>
                </div>
                <p class="text-xs text-slate-400 font-medium mb-4">By ${escapeHtml(song.artist)}</p>
            </div>
            <div class="pt-4 border-t border-white/10 flex items-center justify-between">
                <span class="text-[11px] text-slate-500">Added by ${escapeHtml(song.uploader || 'Community')}</span>
                <button onclick="playTrack('${escapeHtml(song.url)}', '${escapeHtml(song.title)}')" class="px-3 py-1.5 text-xs font-bold bg-white/10 hover:bg-green-500 hover:text-black rounded-lg transition-all flex items-center gap-1.5">
                    <i data-lucide="play" class="w-3.5 h-3.5"></i> Play
                </button>
            </div>
        </div>
    `).join('');

    lucide.createIcons();
}

window.filterSongs = function() {
    const query = document.getElementById('search-input').value.toLowerCase();
    const filtered = allSongs.filter(s => 
        s.title.toLowerCase().includes(query) || 
        s.artist.toLowerCase().includes(query) ||
        (s.uploader && s.uploader.toLowerCase().includes(query))
    );
    renderSongs(filtered);
};

// --- 2. TRACK SUBMISSION ---
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

    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>Submitting...</span>`;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/submit-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title,
                artist,
                url,
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

// --- 3. ADMIN: PENDING REQUESTS QUEUE ---
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

        tableBody.innerHTML = requests.map(req => `
            <tr>
                <td class="px-6 py-4">
                    <div class="font-bold text-white">${escapeHtml(req.title)}</div>
                    <div class="text-xs text-slate-400">${escapeHtml(req.artist)}</div>
                </td>
                <td class="px-6 py-4 text-xs text-slate-300">${escapeHtml(req.submittedBy)}</td>
                <td class="px-6 py-4 text-xs text-slate-500">${new Date(req.createdAt).toLocaleDateString()}</td>
                <td class="px-6 py-4 text-right space-x-2">
                    <button onclick="approveTrack('${req.id}')" class="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-bold transition-all">Approve</button>
                    <button onclick="rejectTrack('${req.id}')" class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-bold transition-all">Reject</button>
                </td>
            </tr>
        `).join('');

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

// --- 4. ADMIN: USER MANAGEMENT ---
async function loadUserList() {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/admin/users`);
        if (!response.ok) throw new Error('Failed to load user list');

        const users = await response.json();
        userContainer.innerHTML = users.map(u => `
            <div class="glass p-5 rounded-2xl border border-white/10 flex items-center justify-between">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        ${u.isLocked ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Locked</span>' : ''}
                    </div>
                    <p class="text-xs text-slate-500 mt-1">Thread ID: ${u.threadId || 'N/A'}</p>
                </div>
                <button onclick="toggleUserLock('${u.threadId}', ${!u.isLocked})" class="px-3 py-1.5 ${u.isLocked ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'} rounded-lg text-xs font-bold hover:opacity-80 transition-all">
                    ${u.isLocked ? 'Unlock' : 'Blacklist'}
                </button>
            </div>
        `).join('');

    } catch (err) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs">User management unavailable.</p>`;
    }
}

window.toggleUserLock = async function(threadId, shouldLock) {
    try {
        await fetch(`${WORKER_BASE_URL}/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId, locked: shouldLock })
        });
        showDashboardAlert(`User status updated.`, 'success');
        loadUserList();
    } catch (err) {
        showDashboardAlert('Failed to update user lock status.');
    }
};

// --- VIDEO MODAL PLAYER ---
window.playTrack = function(url, title) {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('modal-iframe');
    const modalTitle = document.getElementById('modal-title');

    if (!modal || !iframe) return;

    // Convert YouTube URLs to embed URLs if needed
    let embedUrl = url;
    if (url.includes('youtube.com/watch?v=')) {
        const videoId = url.split('v=')[1]?.split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    } else if (url.includes('youtu.be/')) {
        const videoId = url.split('youtu.be/')[1]?.split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
    }

    if (modalTitle) modalTitle.textContent = title;
    iframe.src = embedUrl;
    modal.classList.remove('hidden');
};

window.closeVideoModal = function() {
    const modal = document.getElementById('video-modal');
    const iframe = document.getElementById('modal-iframe');
    if (iframe) iframe.src = '';
    if (modal) modal.classList.add('hidden');
};

// Helper: Escape HTML to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}