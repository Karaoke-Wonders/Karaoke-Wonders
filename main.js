// main.js - Page-specific logic for main.html (Song Library & Submission Modal)

const WORKER_BASE_URL = 'https://karaokewonders.fetched.workers.dev';

document.addEventListener('DOMContentLoaded', () => {
    initUserSession();
    loadSongLibrary();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterSongs(e.target.value);
        });
    }

    const modalForm = document.getElementById('modal-upload-form');
    if (modalForm) {
        modalForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitSongRequest();
        });
    }
});

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

async function loadSongLibrary() {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/songs`);
        if (!response.ok) throw new Error('Failed to fetch songs.');
        
        const songs = await response.json();
        renderSongs(songs);
    } catch (err) {
        console.error('Error loading songs:', err);
        songListContainer.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">Unable to load song library at this time.</p>`;
    }
}

function renderSongs(songs) {
    const songListContainer = document.getElementById('song-list');
    if (!songListContainer) return;

    if (!songs || songs.length === 0) {
        songListContainer.innerHTML = `<p class="text-slate-500 text-xs col-span-full text-center py-8">No approved tracks available yet.</p>`;
        return;
    }

    songListContainer.innerHTML = songs.map(song => {
        const title = song.songName || song.title || 'Untitled';
        const artist = song.artist || 'Unknown Artist';
        const uploader = song.submittedBy || song.uploader || 'Member';
        const playUrl = song.videoId 
            ? (song.videoId.startsWith('http') ? song.videoId : `https://www.youtube.com/watch?v=${song.videoId}`)
            : (song.url || '#');

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

function filterSongs(query) {
    const cards = document.querySelectorAll('#song-list > div');
    const searchTerm = query.toLowerCase();

    cards.forEach(card => {
        const text = card.textContent.toLowerCase();
        card.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

async function submitSongRequest() {
    const title = document.getElementById('modal-track-title').value.trim();
    const artist = document.getElementById('modal-track-artist').value.trim();
    const url = document.getElementById('modal-track-url').value.trim();

    if (!title || !artist || !url) return;

    // Extract YouTube video ID
    let videoId = url;
    if (url.includes('v=')) {
        videoId = url.split('v=')[1]?.split('&')[0];
    } else if (url.includes('youtu.be/')) {
        videoId = url.split('youtu.be/')[1]?.split('?')[0];
    }

    const sessionData = localStorage.getItem('kw_session');
    const user = sessionData ? JSON.parse(sessionData) : { username: 'Guest', threadId: null };

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/submit-track`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                songName: title, 
                artist: artist, 
                videoId: videoId,
                timestamp: 0,
                submittedBy: user.username,
                threadId: user.threadId 
            })
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error || 'Failed to submit track request.');
        }

        closeSubmissionModal();
        document.getElementById('modal-upload-form').reset();
        alert('Song successfully submitted to the moderation queue!');
    } catch (err) {
        console.error('Submission error:', err);
        alert(err.message || 'Error submitting track. Please try again.');
    }
}

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