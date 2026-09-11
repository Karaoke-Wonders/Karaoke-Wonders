// main.js - Stage Portal Logic for main.html

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

let currentUser = null;
let allSongs = [];

document.addEventListener('DOMContentLoaded', () => {
    // 1. Session check: redirect to index.html if not logged in
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

    setupMemberProfile();
    loadSongLibrary();

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // 2. Search input listener
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSongs(e.target.value);
        });
    }

    // 3. Track submission form listener (supports both in-page form and modal)
    const uploadForm = document.getElementById('upload-form') || document.getElementById('modal-upload-form');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitSongRequest();
        });
    }
});

// Configure Member Profile & reveal admin links if staff
function setupMemberProfile() {
    const displayName = document.getElementById('user-display-name');
    const avatar = document.getElementById('user-avatar');
    const roleBadge = document.getElementById('user-role-badge');
    const adminLinks = document.getElementById('admin-links');

    if (displayName) {
        displayName.textContent = currentUser.username || 'Member';
    }

    if (avatar) {
        if (currentUser.avatarUrl && currentUser.avatarUrl.startsWith('http')) {
            avatar.innerHTML = `<img src="${currentUser.avatarUrl}" alt="Avatar" class="w-full h-full object-cover">`;
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
        if (!response.ok) throw new Error('Failed to fetch songs.');

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
        const videoId = song.videoId || '';
        const playUrl = videoId.startsWith('http') ? videoId : `https://www.youtube.com/watch?v=${videoId}`;

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
                <a href="${escapeUrl(playUrl)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 border border-white/10">
                    <i data-lucide="play" class="w-3.5 h-3.5 text-green-400"></i> Play Track
                </a>
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
    const q = (query || '').toLowerCase();
    const filtered = allSongs.filter(song => 
        (song.songName || song.title || '').toLowerCase().includes(q) ||
        (song.artist || '').toLowerCase().includes(q) ||
        (song.submittedBy || '').toLowerCase().includes(q)
    );
    renderSongs(filtered);
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

    // Extract YouTube Video ID
    let videoId = url;
    if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

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
                submittedBy: currentUser.username,
                threadId: currentUser.threadId 
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