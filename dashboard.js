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

// Pagination States (10 items per page)
const PAGE_SIZE = 10;
let songCurrentPage = 1;
let songTotalPages = 1;
let userCurrentPage = 1;
let managementUserCurrentPage = 1;
let userTotalPages = 1;
let managementUserTotalPages = 1;

// Discord Forum Tag IDs for Moderation & RBAC
const TAG_IDS = {
    management: '1549308000664031323',
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027',
    manager: '1549308000664031323',
    kwteam: '1555048910324760676'
};

// ==========================================
// 1. INITIALIZATION & SESSION GOVERNANCE
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log("REFRESH EVENT FIRED!");
    await refreshUserSession();

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
        loadSongs(1)
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
    console.log("refreshUserSession Fired");
    const sessionData = localStorage.getItem('kw_session');
    const managerPage = document.getElementById('tab-management');
    if (!sessionData) return;

    try {
        const user = JSON.parse(sessionData);
        
        const response = await fetch(`/api/get-account`, {
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
        const isTeam = Boolean(data.isTeam || userTags.includes(TAG_IDS.kwteam));

        user.tags = userTags;
        user.isAdmin = isStaff;
        user.isManager = isManager;
        user.isTeam = isTeam,
        user.role = isStaff ? 'administrator' : 'member';

        if (isStaff) {
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> KW Moderation';
            }
        }

        if (isManager) {
            user.role = 'manager';
            const roleBadge = document.getElementById('user-role-label');
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Guide Manager';
            }
            if (managerPage) {
                managerPage.classList.remove('hidden');
            }
        }

        if (isTeam) {
            user.role = 'team';
            const roleBadge = document.getElementById("user-role-label");
            if (roleBadge) {
                roleBadge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> KW Team';
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
// 2. PENDING QUEUE MODERATION SYSTEM
// ==========================================

async function loadPendingRequests() {
    const tableBody = document.getElementById('request-table-body');
    const badge = document.getElementById('pending-badge');
    const statPending = document.getElementById('stat-pending-count');

    try {
        const response = await fetch(`/api/admin/pending-tracks`);
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
        const res = await fetch(`/api/admin/approve-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                trackId,
                staffName: currentUser?.username || 'Unknown Staff'
            })
        });

        if (!res.ok) throw new Error('Failed to approve track');

        showDashboardAlert('Track approved and added to catalog!', 'success');
        await loadPendingRequests();
        await loadSongs(songCurrentPage);
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
        const res = await fetch(`/api/admin/reject-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                trackId,
                staffName: currentUser?.username || 'Unknown Staff'
            })
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
// 3. LIVE SONG CATALOG & SERVER PAGINATION
// ==========================================

async function loadSongs(page = 1) {
    const container = document.getElementById('song-list');
    const songsBadge = document.getElementById('songs-badge');
    const statSongs = document.getElementById('stat-songs-count');
    if (!container) return;

    songCurrentPage = page;

    // Display loading indicator immediately upon clicking page change
    container.innerHTML = `
        <div class="col-span-full text-center py-12 glass rounded-2xl border border-white/10 flex flex-col items-center justify-center space-y-3">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin text-green-400"></i>
            <p class="text-slate-400 text-xs font-medium">Loading tracks...</p>
        </div>
    `;
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    try {
        const response = await fetch(`/api/songs?page=${songCurrentPage}&limit=${PAGE_SIZE}`);
        if (!response.ok) throw new Error('Failed to fetch songs');

        const data = await response.json();

        // Support both direct array and server-side paginated object responses
        if (Array.isArray(data)) {
            allSongs = data;
            songTotalPages = Math.ceil(allSongs.length / PAGE_SIZE) || 1;
            renderSongsClientSide(allSongs);
        } else {
            allSongs = data.songs || [];
            songTotalPages = data.totalPages || 1;
            songCurrentPage = data.page || songCurrentPage;
            
            if (songsBadge) songsBadge.textContent = data.total || allSongs.length;
            if (statSongs) statSongs.textContent = data.total || allSongs.length;
            
            renderSongsServerSide(allSongs);
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">Unable to load songs at this time.</p>`;
    }
}

function renderSongsServerSide(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    if (songs.length === 0) {
        container.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No matching tracks found in catalog.</p>`;
        let existingPagination = document.getElementById('song-pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    container.innerHTML = songs.map(song => {
        const songId = song.id || song._id || ''; // Capture the unique ID
        const escapedSongId = escapeAttr(songId);
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
                    <p class="text-xs text-slate-400 flex items-center gap-1.5 mb-2">
                        <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                    </p>
                    <!-- Song ID Pill Display -->
                    <div class="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono bg-black/30 px-2.5 py-1 rounded-lg border border-white/5 w-fit">
                        <span class="text-slate-500">ID:</span> 
                        <span class="select-all text-emerald-400 font-medium">${escapeHtml(songId)}</span>
                    </div>
                </div>
                <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs gap-2">
                    <span class="text-slate-500 text-[11px] truncate">By ${escapeHtml(uploader)}</span>
                    <div class="flex items-center gap-1.5">
                        <button onclick="openEditTrackModal('${escapedSongId}')" class="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs">
                            <i data-lucide="edit-3" class="w-3.5 h-3.5 text-sky-400"></i> Edit
                        </button>
                        <button onclick="copyVRUrl('${escapeAttr(playUrl)}')" class="px-2 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1 border border-white/10 text-xs">
                            <i data-lucide="copy" class="w-3.5 h-3.5 text-green-400"></i>
                        </button>
                        <button onclick="deleteSong('${escapedSongId}')" id="btn-delete-${escapedSongId}" class="px-2 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold rounded-lg transition-all flex items-center gap-1 border border-red-500/20 text-xs">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    let paginationContainer = document.getElementById('song-pagination-container');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'song-pagination-container';
        paginationContainer.className = 'col-span-full flex items-center justify-between pt-4 mt-2 border-t border-white/5 text-xs text-slate-400';
        container.parentNode.appendChild(paginationContainer);
    }

    paginationContainer.innerHTML = `
        <span>Page ${songCurrentPage} of ${songTotalPages}</span>
        <div class="flex items-center gap-2">
            <button onclick="changeSongPage(${songCurrentPage - 1})" ${songCurrentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Previous
            </button>
            <button onclick="changeSongPage(${songCurrentPage + 1})" ${songCurrentPage >= songTotalPages ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Next
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// Fallback client-side rendering if server returns raw arrays
function renderSongsClientSide(songs) {
    let filtered = songs.filter(s => {
        const q = songSearchQuery.toLowerCase();
        return (
            (s.songName || s.title || '').toLowerCase().includes(q) ||
            (s.artist || '').toLowerCase().includes(q) ||
            (s.submittedBy || '').toLowerCase().includes(q) ||
            (s.id || '').toLowerCase().includes(q)
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

    songTotalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
    if (songCurrentPage > songTotalPages) songCurrentPage = songTotalPages;
    if (songCurrentPage < 1) songCurrentPage = 1;

    const startIndex = (songCurrentPage - 1) * PAGE_SIZE;
    const paginatedItems = filtered.slice(startIndex, startIndex + PAGE_SIZE);

    renderSongsServerSide(paginatedItems);
}

window.changeSongPage = async function(targetPage) {
    if (targetPage < 1 || targetPage > songTotalPages) return;
    await loadSongs(targetPage);
};

window.filterSongs = function(query) {
    songSearchQuery = query || '';
    loadSongs(1);
};

window.sortSongs = function(sortBy) {
    songSortBy = sortBy || 'title';
    loadSongs(1);
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
        const res = await fetch(`/api/admin/add-song`, {
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
        await loadSongs(1);

    } catch (err) {
        showModalError('modal-status-message', 'Failed to add track. Check connectivity.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Add Track';
        }
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

window.updateTrackDirectly = async function(event) {
    if (event) event.preventDefault();

    const songId = document.getElementById('edit-song-id')?.value;
    const songName = document.getElementById('edit-song-title')?.value.trim();
    const artist = document.getElementById('edit-song-artist')?.value.trim();
    const rawVideoId = document.getElementById('edit-song-videoid')?.value.trim();
    const videoId = extractVideoId(rawVideoId);
    const submitBtn = document.getElementById('btn-save-song');

    const staffName = localStorage.getItem('staffName') || window.currentStaffName || 'Staff Member';

    if (!songId || !songName || !artist || !videoId) {
        showModalError('edit-modal-status-message', 'All fields are required.');
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        const res = await fetch(`/api/admin/update-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId, songName, artist, videoId, staffName })
        });

        // Grab the raw text first so we can see what it actually is
        const responseText = await res.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            // If it's not JSON, throw the raw text so we can read it in the modal!
            throw new Error(`Non-JSON response (${res.status}): ${responseText.slice(0, 150)}...`);
        }

        if (!res.ok) {
            throw new Error(data.error || `Server returned status ${res.status}`);
        }

        showDashboardAlert('Song updated successfully!', 'success');
        closeEditTrackModal();
        await loadSongs(songCurrentPage);

    } catch (err) {
        // This will print the exact snippet of what the server sent into your modal box
        showModalError('edit-modal-status-message', err.message);
        console.error("Update error:", err);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Changes';
        }
    }
};

window.deleteSong = async function(songId) {
    if (!songId) {
        showDashboardAlert('Cannot delete track: Missing song ID.', 'error');
        return;
    }

    const song = allSongs.find(s => String(s.id || s._id) === String(songId));
    const songName = song ? (song.songName || song.title) : '';

    if (!confirm(`Are you sure you want to delete "${songName || songId}" from the live catalog?`)) return;

    const btn = document.getElementById(`btn-delete-${songId}`);
    if (btn) btn.disabled = true;

    try {
        const res = await fetch(`/api/admin/delete-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                songId,
                songName,
                staffName: currentUser?.username || 'Unknown Staff'
            })
        });

        if (!res.ok) throw new Error('Failed to delete song');

        showDashboardAlert('Song removed from live catalog successfully!', 'success');
        await loadSongs(songCurrentPage);
    } catch (err) {
        showDashboardAlert('Error deleting song. Please try again.', 'error');
        if (btn) btn.disabled = false;
    }
};


// ==========================================
// 4. USER MODERATION & ROLE MANAGEMENT
// ==========================================

async function loadUserList(page = 1) {
    const userContainer = document.getElementById('user-list');
    const usersBadge = document.getElementById('users-badge');
    const statUsers = document.getElementById('stat-users-count');
    if (!userContainer) return;

    userCurrentPage = page;
    managementUserCurrentPage = page;

    try {
        const response = await fetch(`/api/admin/users?page=${page}&limit=${PAGE_SIZE}`);
        if (!response.ok) throw new Error('Failed to load user list');

        const data = await response.json();

        // Handle both direct array fallback and paginated object responses
        if (Array.isArray(data)) {
            allUsers = data;
            userTotalPages = Math.ceil(allUsers.length / PAGE_SIZE) || 1;
            managementUserTotalPages = userTotalPages;

            if (usersBadge) usersBadge.textContent = allUsers.length;
            if (statUsers) statUsers.textContent = allUsers.length;

            renderUserList(allUsers, false);
            renderManagementList(allUsers, false);
        } else {
            allUsers = data.users || [];
            userCurrentPage = data.page || page;
            managementUserCurrentPage = data.page || page;
            userTotalPages = data.totalPages || 1;
            managementUserTotalPages = data.totalPages || 1;
            
            if (usersBadge) usersBadge.textContent = data.total || 0;
            if (statUsers) statUsers.textContent = data.total || 0;

            renderUserList(allUsers, true);
            renderManagementList(allUsers, true);
        }
    } catch (err) {
        console.error(err);
        userContainer.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">User management service unavailable.</p>`;
    }
}

function renderUserList(users) {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

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
        let existingPagination = document.getElementById('user-pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    userContainer.innerHTML = filtered.map(u => {
        const userTags = (u.tags || []).map(tag => String(tag));
        const threadId = escapeAttr(u.threadId || '');
        const avatarUrl = u.avatarUrl || u.pfp || '/image/kwicon.svg';
        
        const isManagement = Boolean(
            (u.role && u.role.toLowerCase() === 'manager') ||
            (TAG_IDS.manager && userTags.includes(String(TAG_IDS.manager)))
        );
        const isStaff = Boolean(
            u.isAdmin ||
            (u.role && u.role.toLowerCase() === 'administrator') ||
            userTags.includes(String(TAG_IDS.staff))
        );

        const isTeam = Boolean(
            u.isTeam || userTags.includes(String(TAG_IDS.kwteam))
        );

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="flex items-center gap-3 shrink-0">
                            <img src="${escapeAttr(avatarUrl)}" 
                                 alt="${escapeAttr(u.username)}'s avatar" 
                                 onerror="this.onerror=null; this.src='/image/kwicon.svg';" 
                                 class="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0" />
                            <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        </div>

                        <div class="flex items-center gap-1.5 flex-wrap justify-end">
                            ${isTeam ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-bold">KW Team</span>' : ''}
                            ${isManagement ? '<span class="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">Management</span>' : ''}
                            ${isStaff ? '<span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Staff</span>' : ''}
                            ${isBlacklisted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Banned</span>' : ''}
                            ${isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-500">Thread ID: ${escapeHtml(u.threadId || 'N/A')}</p>
                </div>

                <div class="flex items-center gap-2 pt-3 border-t border-white/5 flex-wrap">
                    <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.restricted}', ${!isRestricted})" class="flex-1 py-1.5 px-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-xs font-bold transition-all">
                        ${isRestricted ? 'Unrestrict' : 'Restrict'}
                    </button>
                    <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.blacklisted}', ${!isBlacklisted})" class="flex-1 py-1.5 px-2 ${isBlacklisted ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'} border rounded-lg text-xs font-bold transition-all">
                        ${isBlacklisted ? 'Unban' : 'Blacklist'}
                    </button>
                </div>
            </div>
        `;
    }).join('');

    let paginationContainer = document.getElementById('user-pagination-container');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'user-pagination-container';
        paginationContainer.className = 'col-span-full flex items-center justify-between pt-4 mt-2 border-t border-white/5 text-xs text-slate-400';
        userContainer.parentNode.appendChild(paginationContainer);
    }

    paginationContainer.innerHTML = `
        <span>Page ${userCurrentPage}</span>
        <div class="flex items-center gap-2">
            <button onclick="changeUserPage(${userCurrentPage - 1})" ${userCurrentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Previous
            </button>
            <button onclick="changeUserPage(${userCurrentPage + 1})" class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold">
                Next
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.changeUserPage = async function(targetPage) {
    if (targetPage < 1) return;
    await loadUserList(targetPage);
};

function renderManagementList(users, isServerPaginated = true) {
    const userContainer = document.getElementById('management-user-list');
    if (!userContainer) return;

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

        const isTeam = Boolean(u.isTeam || userTags.includes(String(TAG_IDS.kwteam)));

        let added = false;
        if (isManagement) {
            added = true;
            total++;
        }

        if (isStaff && !added) {
            total++;
        }

        if (isTeam && !added) {
            total++;
        }

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        if (!matchesQuery) return false;

        if (userRoleFilter === 'team') return isTeam;
        if (userRoleFilter === 'manager') return isManagement;
        if (userRoleFilter === 'staff') return isStaff;
        if (userRoleFilter === 'banned') return isBlacklisted;
        if (userRoleFilter === 'restricted') return isRestricted;

        return true;
    });

    if (filtered.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user accounts found matching constraints.</p>`;
        let existingPagination = document.getElementById('management-pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    let itemsToRender = filtered;
    let totalPages = managementUserTotalPages;

    if (!isServerPaginated) {
        totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (managementUserCurrentPage > totalPages) managementUserCurrentPage = totalPages;
        if (managementUserCurrentPage < 1) managementUserCurrentPage = 1;

        const startIndex = (managementUserCurrentPage - 1) * PAGE_SIZE;
        itemsToRender = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    }

    userContainer.innerHTML = itemsToRender.map(u => {
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

        const isTeam = Boolean(u.isTeam || userTags.includes(String(TAG_IDS.kwteam)));

        const isBlacklisted = userTags.includes(String(TAG_IDS.blacklisted)) || Boolean(u.isLocked);
        const isRestricted = userTags.includes(String(TAG_IDS.restricted));

        return `
            <div class="glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-white/20 transition-all">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-1">
                        <span class="font-bold text-white text-sm">${escapeHtml(u.username)}</span>
                        <div class="flex items-center gap-1.5 flex-wrap">
                            ${isTeam ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-bold">KW Team</span>' : ''}
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

    let paginationContainer = document.getElementById('management-pagination-container');
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'management-pagination-container';
        paginationContainer.className = 'col-span-full flex items-center justify-between pt-4 mt-2 border-t border-white/5 text-xs text-slate-400';
        userContainer.parentNode.appendChild(paginationContainer);
    }

    paginationContainer.innerHTML = `
        <span>Page ${managementUserCurrentPage} of ${totalPages}</span>
        <div class="flex items-center gap-2">
            <button onclick="changeManagementUserPage(${managementUserCurrentPage - 1})" ${managementUserCurrentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Previous
            </button>
            <button onclick="changeManagementUserPage(${managementUserCurrentPage + 1})" ${managementUserCurrentPage >= totalPages ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Next
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();

    const mainTotalUsers = document.getElementById('stat-staff-count');
    if (mainTotalUsers) {
        mainTotalUsers.textContent = total;
    }
}

window.changeManagementUserPage = async function(targetPage) {
    if (targetPage < 1 || targetPage > managementUserTotalPages) return;
    await loadUserList(targetPage);
};

window.filterUsers = function(query) {
    userSearchQuery = query || '';
    userCurrentPage = 1;
    managementUserCurrentPage = 1;
    loadUserList(1);
};

window.filterUsersByRole = function(role) {
    userRoleFilter = role || 'all';
    userCurrentPage = 1;
    managementUserCurrentPage = 1;
    loadUserList(1);
};

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    if (!threadId) {
        showDashboardAlert('Cannot alter user: Missing Thread ID.');
        return;
    }

    try {
        const response = await fetch(`/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                threadId, 
                tagId, 
                add: shouldAdd,
                staffName: currentUser?.username || 'Unknown Staff'
            })
        });
        if (!response.ok) throw new Error('Failed to update user tag state');

        showDashboardAlert('User authorization status updated.', 'success');
        await loadUserList(userCurrentPage);
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