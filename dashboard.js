// dashboard.js - Comprehensive Admin Management System (Moderation, Catalog, Users, Metrics)

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

// Global Data States
let currentUser = null;
let allSongs = [];
let allUsers = [];
let pendingQueue = [];

// Pagination States per Section
let currentSongPage = 1;
let currentPendingPage = 1;
let currentUserPage = 1;
const itemsPerPage = 10;

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
    console.log("REFRESH EVENT FIRED!")
    refreshUserSession();

    const sessionData = localStorage.getItem('kw_session');
    
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

    if (!currentUser.isAdmin) {
        alert('Access denied. Administrator privileges required.');
        window.location.href = 'main.html';
        return;
    }

    setupUserProfile();
    bindGlobalEventListeners();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    await Promise.all([
        loadPendingRequests(),
        loadUserList(),
        loadSongs()
    ]);
});

function bindGlobalEventListeners() {
    const addTrackForm = document.getElementById('add-track-form');
    if (addTrackForm) {
        addTrackForm.addEventListener('submit', window.addTrackDirectly);
    }

    const editTrackForm = document.getElementById('edit-track-form');
    if (editTrackForm) {
        editTrackForm.addEventListener('submit', window.updateTrackDirectly);
    }

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
        const userTags = data.tags || [];

        if (userTags.includes(TAG_IDS.blacklisted) || data.isLocked) {
            localStorage.removeItem('kw_session');
            alert('Your account has been restricted or blacklisted.');
            window.location.href = 'index.html';
            return;
        }

        const isStaff = Boolean(data.isAdmin || userTags.includes(TAG_IDS.staff));
        const isManager = Boolean(data.isManager || userTags.includes(TAG_IDS.manager));

        user.tags = userTags;
        user.isAdmin = isStaff;
        user.isManager = isManager;
        user.role = isStaff ? 'administrator' : 'member';

        if (isStaff) {
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Moderator';
            }
        }

        if (isManager) {
            user.role = 'manager';
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Manager';
            }
            if (managerPage) {
                managerPage.classList.remove('hidden');
            }
        }
        
        localStorage.setItem('kw_session', JSON.stringify(user));
    } catch (err) {
        console.error('Failed to sync session background state:', err);
    }
}

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
// 2. PENDING QUEUE MODERATION SYSTEM (WITH PAGINATION)
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

        currentPendingPage = 1;
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
        renderPendingPaginationControls(filtered);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    const startIndex = (currentPendingPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    tableBody.innerHTML = paginatedItems.map(req => {
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

    renderPendingPaginationControls(filtered);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderPendingPaginationControls(filteredList) {
    const totalPages = Math.ceil(filteredList.length / itemsPerPage);
    let controlsContainer = document.getElementById('pending-pagination-controls');

    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'pending-pagination-controls';
        controlsContainer.className = 'flex items-center justify-between px-6 py-4 border-t border-white/10 bg-white/[0.01]';
        
        const tableContainer = document.getElementById('request-table-body')?.closest('.overflow-x-auto') || document.getElementById('request-table-body')?.parentElement;
        if (tableContainer) {
            tableContainer.parentNode.appendChild(controlsContainer);
        }
    }

    if (totalPages <= 1) {
        controlsContainer.innerHTML = '';
        return;
    }

    controlsContainer.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">
            Page <span class="text-white font-bold">${currentPendingPage}</span> of <span class="text-white font-bold">${totalPages}</span>
        </div>
        <div class="flex items-center gap-2">
            <button onclick="changePendingPage(-1)" ${currentPendingPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 glass rounded-lg border border-white/10 text-xs font-bold transition-all flex items-center gap-1 ${currentPendingPage === 1 ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i> Previous
            </button>
            <button onclick="changePendingPage(1)" ${currentPendingPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 glass rounded-lg border border-white/10 text-xs font-bold transition-all flex items-center gap-1 ${currentPendingPage === totalPages ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                Next <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.changePendingPage = function(direction) {
    const filtered = pendingQueue.filter(req => {
        const q = pendingSearchQuery.toLowerCase();
        return (
            (req.songName || req.title || '').toLowerCase().includes(q) ||
            (req.artist || '').toLowerCase().includes(q) ||
            (req.submittedBy || '').toLowerCase().includes(q)
        );
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    currentPendingPage += direction;
    if (currentPendingPage < 1) currentPendingPage = 1;
    if (currentPendingPage > totalPages) currentPendingPage = totalPages;

    renderPendingRequests(pendingQueue);
};

window.filterPendingRequests = function(query) {
    pendingSearchQuery = query || '';
    currentPendingPage = 1;
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
// 3. LIVE SONG CATALOG & CRUD (WITH PAGINATION)
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

        currentSongPage = 1;
        renderSongs(allSongs);
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No approved songs loaded.</p>`;
    }
}

function renderSongs(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    let filtered = songs.filter(s => {
        const q = songSearchQuery.toLowerCase();
        return (
            (s.songName || s.title || '').toLowerCase().includes(q) ||
            (s.artist || '').toLowerCase().includes(q) ||
            (s.submittedBy || '').toLowerCase().includes(q)
        );
    });

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
        renderSongPaginationControls(filtered);
        return;
    }

    const startIndex = (currentSongPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    container.innerHTML = paginatedItems.map(song => {
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

    renderSongPaginationControls(filtered);

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderSongPaginationControls(filteredList) {
    const totalPages = Math.ceil(filteredList.length / itemsPerPage);
    let controlsContainer = document.getElementById('song-pagination-controls');

    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'song-pagination-controls';
        controlsContainer.className = 'col-span-full flex items-center justify-between pt-6 mt-4 border-t border-white/15';
        
        const catalogTab = document.getElementById('content-catalog');
        if (catalogTab) {
            catalogTab.appendChild(controlsContainer);
        }
    }

    if (totalPages <= 1) {
        controlsContainer.innerHTML = '';
        return;
    }

    controlsContainer.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">
            Page <span class="text-white font-bold">${currentSongPage}</span> of <span class="text-white font-bold">${totalPages}</span>
        </div>
        <div class="flex items-center gap-2">
            <button onclick="changeSongPage(-1)" ${currentSongPage === 1 ? 'disabled' : ''} class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentSongPage === 1 ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                <i data-lucide="chevron-left" class="w-4 h-4"></i> Previous
            </button>
            <button onclick="changeSongPage(1)" ${currentSongPage === totalPages ? 'disabled' : ''} class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentSongPage === totalPages ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                Next <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.changeSongPage = function(direction) {
    let filtered = allSongs.filter(s => {
        const q = songSearchQuery.toLowerCase();
        return (
            (s.songName || s.title || '').toLowerCase().includes(q) ||
            (s.artist || '').toLowerCase().includes(q) ||
            (s.submittedBy || '').toLowerCase().includes(q)
        );
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    currentSongPage += direction;
    if (currentSongPage < 1) currentSongPage = 1;
    if (currentSongPage > totalPages) currentSongPage = totalPages;

    renderSongs(allSongs);
};

window.filterSongs = function(query) {
    songSearchQuery = query || '';
    currentSongPage = 1;
    renderSongs(allSongs);
};

window.sortSongs = function(sortBy) {
    songSortBy = sortBy || 'title';
    currentSongPage = 1;
    renderSongs(allSongs);
};

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

window.deleteSong = async function(songId) {
    if (!songId) {
        showDashboardAlert('Cannot delete track: Missing song ID.');
        return;
    }

    if (!confirm('Are you sure you want to remove this song from the live catalog?')) return;

    const btn = document.getElementById(`btn-delete-${songId}`);
    if (btn) btn.disabled = true;

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
// 4. USER MODERATION & ROLE MANAGEMENT (WITH PAGINATION)
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

        currentUserPage = 1;
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

    const filtered = users.filter(u => {
        const q = userSearchQuery.toLowerCase();
        const matchesQuery = (u.username || '').toLowerCase().includes(q);
        
        if (userRoleFilter === 'admin') return matchesQuery && u.isAdmin;
        if (userRoleFilter === 'member') return matchesQuery && !u.isAdmin;
        return matchesQuery;
    });

    if (filtered.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No users found.</p>`;
        renderUserPaginationControls(filtered);
        return;
    }

    const startIndex = (currentUserPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    userContainer.innerHTML = paginatedItems.map(user => {
        const username = escapeHtml(user.username || 'Unknown');
        const role = user.isAdmin ? 'Administrator' : 'Member';
        const roleBadgeClass = user.isAdmin ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20';

        return `
            <div class="glass p-4 rounded-xl border border-white/10 flex items-center justify-between">
                <div>
                    <div class="font-bold text-white text-sm">${username}</div>
                    <span class="px-2 py-0.5 text-[10px] font-bold rounded-md border ${roleBadgeClass}">${role}</span>
                </div>
            </div>
        `;
    }).join('');

    renderUserPaginationControls(filtered);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderUserPaginationControls(filteredList) {
    const totalPages = Math.ceil(filteredList.length / itemsPerPage);
    let controlsContainer = document.getElementById('user-pagination-controls');

    if (!controlsContainer) {
        controlsContainer = document.createElement('div');
        controlsContainer.id = 'user-pagination-controls';
        controlsContainer.className = 'col-span-full flex items-center justify-between pt-4 mt-4 border-t border-white/10';
        
        const userTab = document.getElementById('content-users');
        if (userTab) {
            userTab.appendChild(controlsContainer);
        }
    }

    if (totalPages <= 1) {
        controlsContainer.innerHTML = '';
        return;
    }

    controlsContainer.innerHTML = `
        <div class="text-xs text-slate-400 font-medium">
            Page <span class="text-white font-bold">${currentUserPage}</span> of <span class="text-white font-bold">${totalPages}</span>
        </div>
        <div class="flex items-center gap-2">
            <button onclick="changeUserPage(-1)" ${currentUserPage === 1 ? 'disabled' : ''} class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentUserPage === 1 ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                <i data-lucide="chevron-left" class="w-4 h-4"></i> Previous
            </button>
            <button onclick="changeUserPage(1)" ${currentUserPage === totalPages ? 'disabled' : ''} class="px-3.5 py-2 glass rounded-xl border border-white/10 text-xs font-bold transition-all flex items-center gap-1.5 ${currentUserPage === totalPages ? 'opacity-40 cursor-not-allowed text-slate-600' : 'hover:bg-white/10 text-slate-200'}">
                Next <i data-lucide="chevron-right" class="w-4 h-4"></i>
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.changeUserPage = function(direction) {
    const filtered = allUsers.filter(u => {
        const q = userSearchQuery.toLowerCase();
        const matchesQuery = (u.username || '').toLowerCase().includes(q);
        if (userRoleFilter === 'admin') return matchesQuery && u.isAdmin;
        if (userRoleFilter === 'member') return matchesQuery && !u.isAdmin;
        return matchesQuery;
    });
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
    currentUserPage += direction;
    if (currentUserPage < 1) currentUserPage = 1;
    if (currentUserPage > totalPages) currentUserPage = totalPages;

    renderUserList(allUsers);
};

// Manager tab list rendering helper (if separate UI table exists)
function renderManagementList(users) {
    const managerContainer = document.getElementById('management-user-list');
    if (!managerContainer) return;
    // Follows similar pattern if manager panel uses a separate element
}

// Utility Helpers
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

function escapeAttr(str) {
    if (!str) return '';
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function extractVideoId(urlOrId) {
    if (!urlOrId) return '';
    const str = urlOrId.trim();
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
    const match = str.match(ytRegex);
    if (match && match[1]) return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(str)) return str;
    return str;
}

function resetModalStatus(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = '';
        el.classList.add('hidden');
    }
}

function showModalError(elementId, message) {
    const el = document.getElementById(elementId);
    if (el) {
        el.textContent = message;
        el.classList.remove('hidden');
    }
}

window.copyVRUrl = function(url) {
    navigator.clipboard.writeText(url).then(() => {
        showDashboardAlert('Track URL copied to clipboard!', 'success');
    }).catch(() => {
        showDashboardAlert('Failed to copy link.', 'error');
    });
};