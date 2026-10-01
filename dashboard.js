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
let songSearchTimer = null;
let pendingSearchQuery = '';

// Pagination States (10 items per page)
const PAGE_SIZE = 10;
let songCurrentPage = 1;
let songTotalPages = 1;
let userCurrentPage = 1;
let managementUserCurrentPage = 1;

// Discord Forum Tag IDs for Moderation & RBAC
const TAG_IDS = {
    management: '1549308000664031323',
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027',
    manager: '1549308000664031323',
    kwteam: '1555048910324760676'
};

function adminFetch(url, options = {}) {
    return fetch(url, {
        ...options,
        headers: window.kwAuthHeaders(options.headers || {})
    });
}

function restoreDashboardUrlState() {
    const params = new URLSearchParams(window.location.search);
    const songPage = Number.parseInt(params.get('songPage'), 10);
    const userPage = Number.parseInt(params.get('userPage'), 10);
    songCurrentPage = Number.isFinite(songPage) && songPage > 0 ? songPage : 1;
    userCurrentPage = Number.isFinite(userPage) && userPage > 0 ? userPage : 1;
    managementUserCurrentPage = userCurrentPage;
    songSearchQuery = params.get('songSearch') || '';
    songSortBy = params.get('songSort') || 'title';
    userSearchQuery = params.get('userSearch') || '';
    userRoleFilter = params.get('userRole') || 'all';
}

function updateDashboardUrlState(changes, historyMethod = 'replaceState') {
    const url = new URL(window.location.href);
    Object.entries(changes).forEach(([key, value]) => {
        const isDefaultPage = (key === 'songPage' || key === 'userPage') && Number(value) <= 1;
        const isDefaultSort = key === 'songSort' && value === 'title';
        const isDefaultRole = key === 'userRole' && value === 'all';
        if (value === null || value === undefined || value === '' || isDefaultPage || isDefaultSort || isDefaultRole) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, String(value));
        }
    });
    window.history[historyMethod]({}, '', `${url.pathname}${url.search}${url.hash}`);
}

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

    restoreDashboardUrlState();
    const songSearchInput = document.getElementById('admin-search-input');
    const userSearchInput = document.getElementById('user-search-input');
    const managementSearchInput = document.getElementById('management-search-input');
    if (songSearchInput) songSearchInput.value = songSearchQuery;
    if (userSearchInput) userSearchInput.value = userSearchQuery;
    if (managementSearchInput) managementSearchInput.value = userSearchQuery;

    setupUserProfile();
    bindGlobalEventListeners();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    await Promise.all([
        loadPendingRequests(),
        loadUserList(userCurrentPage),
        loadSongs(songCurrentPage)
    ]);
});

window.addEventListener('popstate', () => {
    if (!currentUser?.isAdmin) return;
    restoreDashboardUrlState();
    const songSearchInput = document.getElementById('admin-search-input');
    const userSearchInput = document.getElementById('user-search-input');
    const managementSearchInput = document.getElementById('management-search-input');
    if (songSearchInput) songSearchInput.value = songSearchQuery;
    if (userSearchInput) userSearchInput.value = userSearchQuery;
    if (managementSearchInput) managementSearchInput.value = userSearchQuery;
    loadSongs(songCurrentPage);
    loadUserList(userCurrentPage);
});

function bindGlobalEventListeners() {
    const editTrackForm = document.getElementById('edit-track-form');
    if (editTrackForm) {
        editTrackForm.addEventListener('submit', window.updateTrackDirectly);
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
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
        user.isTeam = isTeam;
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

window.addEventListener('kw-session-updated', event => {
    currentUser = event.detail;
    if (!currentUser.isAdmin) {
        window.location.replace('main.html');
        return;
    }

    setupUserProfile();
    const managerTab = document.getElementById('tab-management');
    if (managerTab) managerTab.classList.toggle('hidden', !(currentUser.isManager || currentUser.isTeam));

    const roleBadge = document.getElementById('user-role-label');
    if (roleBadge) {
        roleBadge.innerHTML = currentUser.isTeam
            ? '<span class="w-1.5 h-1.5 rounded-full bg-yellow-400"></span> KW Team'
            : currentUser.isManager
                ? '<span class="w-1.5 h-1.5 rounded-full bg-red-400"></span> Guide Manager'
                : '<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> KW Moderation';
    }
});

window.addEventListener('kw-song-catalog-updated', () => loadSongs(songCurrentPage));

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
        const response = await adminFetch(`/api/admin/pending-tracks?_t=${Date.now()}`, { cache: 'no-store' });
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
        const reqId = escapeHtml(req.id || req._id || '');
        const title = req.songName || req.title || 'Untitled';
        const artist = req.artist || 'Unknown';
        const videoId = req.videoId || '';
        const normalizedVideoId = extractVideoId(videoId);
        const rawUrl = /^[a-zA-Z0-9_-]{11}$/.test(normalizedVideoId)
            ? `https://www.youtube.com/watch?v=${normalizedVideoId}`
            : '#';
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
                        <button data-preview-video="${escapeHtml(videoId)}" data-preview-title="${escapeHtml(title)}" data-preview-artist="${escapeHtml(artist)}" class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 text-sky-400 text-xs font-medium transition-all">
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
                    <button data-track-action="approve" data-track-id="${reqId}" id="btn-approve-${reqId}" class="px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                        <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve
                    </button>
                    <button data-track-action="reject" data-track-id="${reqId}" id="btn-reject-${reqId}" class="px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Reject
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.querySelectorAll('[data-preview-video]').forEach(button => {
        button.addEventListener('click', () => {
            openPreviewModal(
                button.dataset.previewVideo,
                button.dataset.previewTitle,
                button.dataset.previewArtist
            );
        });
    });
    tableBody.querySelectorAll('[data-track-action]').forEach(button => {
        button.addEventListener('click', () => {
            const trackId = button.dataset.trackId;
            if (button.dataset.trackAction === 'approve') approveTrack(trackId);
            else if (button.dataset.trackAction === 'reject') rejectTrack(trackId);
        });
    });

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
        const res = await adminFetch(`/api/admin/approve-track`, {
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
        const res = await adminFetch(`/api/admin/reject-track`, {
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
        const params = new URLSearchParams({
            page: String(page),
            limit: String(PAGE_SIZE),
            search: songSearchQuery,
            sort: songSortBy,
            _t: String(Date.now())
        });
        const response = await fetch(`/api/songs?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to fetch songs');

        const data = await response.json();
        allSongs = Array.isArray(data.songs) ? data.songs : [];
        songTotalPages = Number(data.totalPages) || 1;
        songCurrentPage = Number(data.page) || 1;
        window.setSongCatalogVersion?.(data.version);
        if (songsBadge) songsBadge.textContent = Number(data.total) || 0;
        if (statSongs) statSongs.textContent = Number(data.total) || 0;
        renderSongsServerSide(allSongs);
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
        const songId = song.id || song._id || '';
        const escapedSongId = escapeAttr(songId);
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const videoId = extractVideoId(song.videoId);
        const playUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : '#';

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

window.changeSongPage = async function(targetPage) {
    if (targetPage < 1 || targetPage > songTotalPages) return;
    songCurrentPage = targetPage;
    updateDashboardUrlState({ songPage: songCurrentPage }, 'pushState');
    await loadSongs(songCurrentPage);
};

window.filterSongs = function(query) {
    songSearchQuery = query || '';
    songCurrentPage = 1;
    updateDashboardUrlState({ songSearch: songSearchQuery, songPage: 1 });
    window.clearTimeout(songSearchTimer);
    songSearchTimer = window.setTimeout(() => loadSongs(1), 250);
};

window.sortSongs = function(sortBy) {
    songSortBy = sortBy || 'title';
    songCurrentPage = 1;
    updateDashboardUrlState({ songSort: songSortBy, songPage: 1 });
    loadSongs(1);
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
    const form = event?.currentTarget;
    if (form?.dataset.submitting === 'true') return;

    const songId = document.getElementById('edit-song-id')?.value;
    const songName = document.getElementById('edit-song-title')?.value.trim();
    const artist = document.getElementById('edit-song-artist')?.value.trim();
    const rawVideoId = document.getElementById('edit-song-videoid')?.value.trim();
    const videoId = extractVideoId(rawVideoId);
    const submitBtn = document.getElementById('btn-save-song');

    const staffName = currentUser?.username || 'Staff Member';

    if (!songId || !songName || !artist || !videoId) {
        showModalError('edit-modal-status-message', 'All fields are required.');
        return;
    }

    if (form) form.dataset.submitting = 'true';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Saving...';
    }

    try {
        const res = await adminFetch(`/api/admin/update-song`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ songId, songName, artist, videoId, staffName })
        });

        const responseText = await res.text();

        let data;
        try {
            data = JSON.parse(responseText);
        } catch (e) {
            throw new Error(`Non-JSON response (${res.status}): ${responseText.slice(0, 150)}...`);
        }

        if (!res.ok) {
            throw new Error(data.error || `Server returned status ${res.status}`);
        }

        // Update local memory state optimistically
        const targetSong = allSongs.find(s => String(s.id || s._id) === String(songId));
        if (targetSong) {
            targetSong.songName = songName;
            targetSong.title = songName;
            targetSong.artist = artist;
            targetSong.videoId = videoId;
            renderSongsServerSide(allSongs);
        }

        showDashboardAlert('Song updated successfully!', 'success');
        closeEditTrackModal();

    } catch (err) {
        showModalError('edit-modal-status-message', err.message);
        console.error("Update error:", err);
    } finally {
        if (form) delete form.dataset.submitting;
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
        const res = await adminFetch(`/api/admin/delete-song`, {
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
        setTimeout(() => loadSongs(songCurrentPage), 800);
    } catch (err) {
        showDashboardAlert('Error deleting song. Please try again.', 'error');
        if (btn) btn.disabled = false;
    }
};


// ==========================================
// 4. USER MODERATION & ROLE MANAGEMENT
// ==========================================

let userTotalPages = 1;
let managementUserTotalPages = 1;
let totalStaffCount = 0;
let userSearchTimer = null;

async function loadUserList(page = 1) {
    const userContainer = document.getElementById('user-list');
    const usersBadge = document.getElementById('users-badge');
    const statUsers = document.getElementById('stat-users-count');
    const mainTotalUsers = document.getElementById('stat-staff-count');
    if (!userContainer) return;

    userCurrentPage = page;
    managementUserCurrentPage = page;

    try {
        const params = new URLSearchParams({
            page: String(page),
            limit: String(PAGE_SIZE),
            search: userSearchQuery,
            role: userRoleFilter,
            _t: String(Date.now())
        });
        const response = await adminFetch(`/api/admin/users?${params}`, { cache: 'no-store' });
        if (!response.ok) throw new Error('Failed to load user list');

        const data = await response.json();

        if (Array.isArray(data)) {
            allUsers = data;
            userTotalPages = Math.ceil(allUsers.length / PAGE_SIZE) || 1;
            managementUserTotalPages = userTotalPages;

            const totalStaff = allUsers.filter(u => u.isStaff || u.isManager).length;

            if (usersBadge) usersBadge.textContent = allUsers.length;
            if (statUsers) statUsers.textContent = allUsers.length;
            if (mainTotalUsers) mainTotalUsers.textContent = totalStaff;

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
            if (mainTotalUsers) mainTotalUsers.textContent = data.totalStaff ?? allUsers.filter(u => u.isStaff || u.isManager).length;

            renderUserList(allUsers, true);
            renderManagementList(allUsers, true);
        }
    } catch (err) {
        console.error(err);
        userContainer.innerHTML = `<p class="col-span-full text-center text-red-400 text-xs py-8">User management service unavailable.</p>`;
    }
}

function renderUserList(users, isServerPaginated = true) {
    const userContainer = document.getElementById('user-list');
    if (!userContainer) return;

    const filtered = users.filter(u => {
        const q = userSearchQuery.toLowerCase();
        const matchesQuery = (u.username || '').toLowerCase().includes(q) || (u.threadId || '').toLowerCase().includes(q);

        if (!matchesQuery) return false;

        if (userRoleFilter === 'manager') return u.isManager;
        if (userRoleFilter === 'staff') return u.isStaff;
        if (userRoleFilter === 'banned') return u.isLocked;
        if (userRoleFilter === 'restricted') return u.isRestricted;

        return true;
    });

    if (filtered.length === 0) {
        userContainer.innerHTML = `<p class="col-span-full text-center text-slate-500 text-xs py-8">No user accounts found matching constraints.</p>`;
        const existingPagination = document.getElementById('user-pagination-container');
        if (existingPagination) existingPagination.remove();
        return;
    }

    let itemsToRender = filtered;
    let totalPages = userTotalPages;

    if (!isServerPaginated) {
        totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
        if (userCurrentPage > totalPages) userCurrentPage = totalPages;
        if (userCurrentPage < 1) userCurrentPage = 1;
        const startIndex = (userCurrentPage - 1) * PAGE_SIZE;
        itemsToRender = filtered.slice(startIndex, startIndex + PAGE_SIZE);
    }

    userContainer.innerHTML = itemsToRender.map(u => {
        const threadId = escapeAttr(u.threadId || '');
        const avatarUrl = u.avatarUrl || '/image/kwicon.svg';

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
                            ${u.isManager ? '<span class="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-bold">Manager</span>' : ''}
                            ${u.isStaff ? '<span class="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">Staff</span>' : ''}
                            ${u.isLocked ? '<span class="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-400 border border-red-500/30 font-bold">Banned</span>' : ''}
                            ${u.isRestricted ? '<span class="text-[10px] px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 font-bold">Restricted</span>' : ''}
                        </div>
                    </div>
                    <p class="text-[11px] text-slate-500">Thread ID: ${escapeHtml(u.threadId || 'N/A')}</p>
                </div>

                <div class="flex items-center gap-2 pt-3 border-t border-white/5 flex-wrap">
                    <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.restricted}', ${!u.isRestricted})" class="flex-1 py-1.5 px-2 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/20 rounded-lg text-xs font-bold transition-all">
                        ${u.isRestricted ? 'Unrestrict' : 'Restrict'}
                    </button>
                    <button onclick="toggleUserTag('${threadId}', '${TAG_IDS.blacklisted}', ${!u.isLocked})" class="flex-1 py-1.5 px-2 ${u.isLocked ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20 border-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20'} border rounded-lg text-xs font-bold transition-all">
                        ${u.isLocked ? 'Unban' : 'Blacklist'}
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
        <span>Page ${userCurrentPage} of ${totalPages}</span>
        <div class="flex items-center gap-2">
            <button onclick="changeUserPage(${userCurrentPage - 1})" ${userCurrentPage <= 1 ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Previous
            </button>
            <button onclick="changeUserPage(${userCurrentPage + 1})" ${userCurrentPage >= totalPages ? 'disabled class="px-3 py-1.5 rounded-lg bg-white/5 text-slate-600 border border-white/5 cursor-not-allowed"' : 'class="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white border border-white/10 transition-all font-bold"'}>
                Next
            </button>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function renderManagementList(users, isServerPaginated = true) {
    const userContainer = document.getElementById('management-user-list');
    if (!userContainer) return;

    let pageStaffTotal = 0;
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
        if (isManagement) { added = true; pageStaffTotal++; }
        if (isStaff && !added) { added = true; pageStaffTotal++; }
        if (isTeam && !added) { pageStaffTotal++; }

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
        if (!isServerPaginated) {
            mainTotalUsers.textContent = pageStaffTotal;
        } else if (totalStaffCount > 0) {
            mainTotalUsers.textContent = totalStaffCount;
        }
    }
}

window.changeUserPage = async function(targetPage) {
    if (targetPage < 1 || targetPage > userTotalPages) return;
    updateDashboardUrlState({ userPage: targetPage }, 'pushState');
    await loadUserList(targetPage);
};

window.changeManagementUserPage = async function(targetPage) {
    if (targetPage < 1 || targetPage > managementUserTotalPages) return;
    updateDashboardUrlState({ userPage: targetPage }, 'pushState');
    await loadUserList(targetPage);
};

window.filterUsers = function(query) {
    userSearchQuery = query || '';
    userCurrentPage = 1;
    managementUserCurrentPage = 1;
    updateDashboardUrlState({ userSearch: userSearchQuery, userPage: 1 });
    window.clearTimeout(userSearchTimer);
    userSearchTimer = window.setTimeout(() => loadUserList(1), 250);
};

window.filterManagementUsers = window.filterUsers;

window.filterUsersByRole = function(role) {
    userRoleFilter = role || 'all';
    userCurrentPage = 1;
    managementUserCurrentPage = 1;
    updateDashboardUrlState({ userRole: userRoleFilter, userPage: 1 });
    window.clearTimeout(userSearchTimer);
    loadUserList(1);
};

window.toggleUserTag = async function(threadId, tagId, shouldAdd) {
    if (!threadId) {
        showDashboardAlert('Cannot alter user: Missing Thread ID.');
        return;
    }

    try {
        const isStaffChange = tagId === TAG_IDS.staff;
        const response = await adminFetch(isStaffChange ? `/api/admin/toggle-staff` : `/api/admin/toggle-lock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                threadId, 
                ...(isStaffChange ? {} : { tagId }),
                add: shouldAdd,
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
    const extractedVideoId = extractVideoId(videoId);
    if (!/^[a-zA-Z0-9_-]{11}$/.test(extractedVideoId)) {
        showDashboardAlert('This track does not have a valid YouTube video ID.', 'error');
        return;
    }

    let modal = document.getElementById('preview-track-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'preview-track-modal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm';
        document.body.appendChild(modal);
    }

    const embedUrl = `https://www.youtube.com/embed/${extractedVideoId}?autoplay=1`;

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
    const value = String(urlOrId).trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(value)) return value;

    try {
        const url = new URL(value);
        const hostname = url.hostname.toLowerCase();
        let videoId = '';

        if (hostname === 'youtu.be') {
            videoId = url.pathname.split('/')[1] || '';
        } else if (hostname === 'youtube.com' || hostname.endsWith('.youtube.com')) {
            videoId = url.searchParams.get('v') || url.pathname.match(/^\/(?:embed|shorts|v)\/([^/]+)/)?.[1] || '';
        }

        return /^[a-zA-Z0-9_-]{11}$/.test(videoId) ? videoId : '';
    } catch {
        return '';
    }
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