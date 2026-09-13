// main.js - Stage Portal Logic for main.html

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

// Discord Forum Tag IDs from server settings
const TAG_IDS = {
    staff: '1548667928881139712',
    restricted: '1548667951069007964',
    blacklisted: '1548667978181247027'
};

let currentUser = null;
let allSongs = [];

/**
 * Normalizes user session data regardless of whether properties are 
 * top-level or nested inside user/account/data objects.
 */
function normalizeUserData(raw) {
    if (!raw || typeof raw !== 'object') return null;

    // Support nested wrappers like { user: { ... } }, { account: { ... } }, or { data: { ... } }
    const base = raw.user || raw.account || raw.data || raw;

    const username = base.username || base.name || base.user || base.displayName || raw.username || '';
    const password = base.password || base.pass || base.token || raw.password || '';
    const avatarUrl = base.avatarUrl || base.avatar || base.pfp || base.profilePicture || raw.avatarUrl || '';
    const tags = Array.isArray(base.tags) ? base.tags : (Array.isArray(raw.tags) ? raw.tags : []);
    const threadId = base.threadId || raw.threadId || '';

    // Determine staff/admin privilege
    const isAdmin = Boolean(
        base.isAdmin || 
        raw.isAdmin || 
        base.admin || 
        raw.admin || 
        base.role === 'admin' || 
        base.role === 'administrator' || 
        tags.includes(TAG_IDS.staff) || 
        (username && username.toLowerCase().includes('admin'))
    );

    return {
        ...raw,
        ...base,
        username,
        password,
        avatarUrl,
        tags,
        threadId,
        isAdmin,
        role: isAdmin ? 'administrator' : 'member'
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

    // 2. Render UI immediately using normalized credentials
    setupMemberProfile();
    loadSongLibrary();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 3. Search input listener
    const searchInput = document.getElementById('search-input');
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
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-purple-400"></span> Staff Moderator`;
        }
        if (adminLinks) {
            adminLinks.classList.remove('hidden');
        }
    } else {
        if (roleBadge) {
            roleBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> Member`;
        }
    }
}

// Tab switcher for main.html
window.switchTab = function(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.sidebar-link').forEach(btn => btn.classList.remove('active'));

    const activeSection = document.getElementById(`content-${tabName}`);
    if (activeSection) activeSection.classList.remove('hidden');

    const activeBtn = document.getElementById(`tab-${tabName}`);
    if (activeBtn) activeBtn.classList.add('active');

    hideAlert();
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
        const rawUser = JSON.parse(sessionData);
        const user = normalizeUserData(rawUser);
        
        // Safety Guard: Don't query Worker API if credentials are missing
        if (!user || !user.username || !user.password) {
            console.warn('Session missing valid username or password. Keeping local session active.');
            return;
        }

        const response = await fetch(`${WORKER_BASE_URL}/api/get-account`, {
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
            userTags.includes(TAG_IDS.staff) || 
            (user.username && user.username.toLowerCase().includes('admin'))
        );

        // Update local session object while retaining existing properties
        const updatedUser = {
            ...user,
            ...data,
            tags: userTags,
            isAdmin: isStaff,
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

// Load approved songs from Worker API
async function loadSongLibrary() {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);

        allSongs = await response.json();
        renderSongs(allSongs);
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
                <p class="text-slate-400 text-sm">No approved songs available yet.</p>
            </div>
        `;
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
    }

    songListContainer.innerHTML = songs.map(song => {
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const rawVideoId = song.videoId || '';

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
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-bold text-base text-white tracking-tight">${escapeHtml(title)}</h3>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">Ready</span>
                </div>
                <p class="text-xs text-slate-400 flex items-center gap-1.5">
                    <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(artist)}
                </p>
            </div>
            <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                <span class="text-slate-500 text-[11px]">Requested by ${escapeHtml(uploader)}</span>
                ${playButtonHtml}
            </div>
        </div>
        `;
    }).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Search and filter songs
function filterSongs(query) {
    const q = (query || '').toLowerCase().trim();
    if (!q) {
        renderSongs(allSongs);
        return;
    }

    const filtered = allSongs.filter(song => 
        (song.songName || song.title || '').toLowerCase().includes(q) ||
        (song.artist || '').toLowerCase().includes(q) ||
        (song.submittedBy || '').toLowerCase().includes(q)
    );
    renderSongs(filtered);
}

// Extract YouTube Video ID from any URL format or raw ID
function extractYouTubeId(urlOrId) {
    if (!urlOrId) return '';
    const str = urlOrId.trim();
    
    // YouTube URL regex matching standard, shortlink, embed, and shorts formats
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/;
    const match = str.match(ytRegex);
    if (match && match[1]) {
        return match[1];
    }
    
    // Return direct 11-char ID if passed
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
        const response = await fetch(`${WORKER_BASE_URL}/api/submit-track`, {
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

        // Reset form inputs
        if (titleInput) titleInput.value = '';
        if (artistInput) artistInput.value = '';
        if (urlInput) urlInput.value = '';

        showAlert('Song successfully submitted! A staff member will review it shortly.', 'success');

        // Close modal overlay if present
        const modal = document.getElementById('upload-modal') || document.getElementById('track-modal');
        if (modal) {
            modal.classList.add('hidden');
        }

        // Auto-switch back to the library after 2 seconds
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