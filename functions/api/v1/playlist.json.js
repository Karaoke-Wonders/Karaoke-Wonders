import { fetchAllSongsFromGitHub } from '../../_utils.js';

export async function onRequestGet({ env }) {
    console.log("[handleGetVRChatPlaylist] Fetching all songs for VRChat playlist...");
    const allSongs = await fetchAllSongsFromGitHub(env);
    const playlist = allSongs.map(song => ({
        songName: song.songName,
        artist: song.artist,
        videoId: song.videoId,
        timestamp: Number(song.timestamp) || 0
    }));
    console.log(`[handleGetVRChatPlaylist] Returning ${playlist.length} songs.`);
    return new Response(JSON.stringify(playlist), {
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=30'
        }
    });
}