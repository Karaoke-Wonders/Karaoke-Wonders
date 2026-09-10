// main.js - Page-specific logic for main.html (Song Library & Submission Modal)

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize session check and display user info using dashboard.js logic
    initUserSession();

    // 2. Fetch and render the approved song library
    loadSongLibrary();

    // 3. Attach search filter event listener
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSongs(e.target.value);
        });
    }

    // 4. Handle Modal Form Submission for New Song Requests
    const modalForm = document.getElementById('modal-upload-form');
    if (modalForm) {
        modalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitSongRequest();
        });
    }
});

// Session initialization helper
function initUserSession() {
    const sessionData = localStorage.getItem('kw_session');
    
    if (!sessionData) {
        window.location.href = 'index.html';
        return;
    }

    const user = JSON.parse(sessionData);
    const avatarContainer = document.getElementById('user-avatar');
    const displayName = document.getElementById('user-display-name');

    if (displayName) {
        displayName.textContent = user.username;
    }

    if (avatarContainer) {
        if (user.avatarUrl) {
            avatarContainer.innerHTML = `<img src="${user.avatarUrl}" alt="${user.username}" class="w-full h-full object-cover rounded-xl">`;
            avatarContainer.className = "w-10 h-10 rounded-xl overflow-hidden border border-white/20 shadow-md shrink-0";
        } else {
            avatarContainer.textContent = user.username.charAt(0).toUpperCase();
        }
    }
}

// Modal control functions
function openSubmissionModal() {
    const modal = document.getElementById('submission-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

function closeSubmissionModal() {
    const modal = document.getElementById('submission-modal');
    if (modal) {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }
}

// Load songs from backend API (leveraging WORKER_BASE_URL from dashboard.js if defined)
async function loadSongLibrary() {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    try {
        const baseUrl = typeof WORKER_BASE_URL !== 'undefined' ? WORKER_BASE_URL : 'https://karaokewonders.fetched.workers.dev/';
        const response = await fetch(`${baseUrl}/api/songs`);
        
        if (!response.ok) throw new Error('Failed to fetch songs.');
        
        const songs = await response.json();
        renderSongs(songs);
    } catch (err) {
        console.error('Error loading songs:', err);
        songListContainer.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">Unable to load song library at this time.</p>`;
    }
}

// Render songs into the grid
function renderSongs(songs) {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    if (!songs || songs.length === 0) {
        songListContainer.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">No approved tracks available yet.</p>`;
        return;
    }

    songListContainer.innerHTML = songs.map(song => `
        glass p-5 rounded-2xl border border-white/10 flex flex-col justify-between space-y-4 hover:border-green-500/30 transition-all">
            <div>
                <div class="flex items-start justify-between gap-2 mb-2">
                    <h3 class="font-bold text-base text-white tracking-tight">${escapeHtml(song.title)}</h3>
                    <span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">Ready</span>
                </div>
                <p class="text-xs text-slate-400 flex items-center gap-1.5">
                    <i data-lucide="mic-2" class="w-3.5 h-3.5 text-slate-500"></i> ${escapeHtml(song.artist)}
                </p>
            </div>
            <div class="pt-4 border-t border-white/5 flex items-center justify-between text-xs">
                <span class="text-slate-500 text-[11px]">Requested by ${escapeHtml(song.uploader || 'Member')}</span>
                <a href="${escapeUrl(song.url)}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white font-bold rounded-lg transition-all flex items-center gap-1.5 border border-white/10">
                    <i data-lucide="play" class="w-3.5 h-3.5 text-green-400"></i> Play Track
                </a>
            </div>
        </div>
    `).join('');

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Filter songs based on search input
function filterSongs(query) {
    const cards = document.querySelectorAll('#song-list > div');
    const searchTerm = query.toLowerCase();

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            card.style.display = '';
        } else {
            card.style.display = 'none';
        }
    });
}

// Submit a new song request from modal
async function submitSongRequest() {
    const title = document.getElementById('modal-track-title').value.trim();
    const artist = document.getElementById('modal-track-artist').value.trim();
    const url = document.getElementById('modal-track-url').value.trim();

    if (!title || !artist || !url) return;

    const sessionData = localStorage.getItem('kw_session');
    const user = sessionData ? JSON.parse(sessionData) : { username: 'Guest' };

    try {
        const baseUrl = typeof WORKER_BASE_URL !== 'undefined' ? WORKER_BASE_URL : 'https://karaokewonders.fetched.workers.dev/';
        const response = await fetch(`${baseUrl}/api/submit-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, artist, url, uploader: user.username })
        });

        if (!response.ok) throw new Error('Failed to submit track request.');

        closeSubmissionModal();
        document.getElementById('modal-upload-form').reset();
        alert('Song successfully submitted to the moderation queue!');
    } catch (err) {
        console.error('Submission error:', err);
        alert('Error submitting track. Please try again.');
    }
}

// Utility for basic sanitization
function escapeHtml(str) {
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