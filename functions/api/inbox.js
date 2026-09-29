import { jsonResponse } from '../_utils.js';

export async function onRequestGet({ request }) {
    const url = new URL(request.url);
    const userParam = url.searchParams.get('user');
    const inboxRes = await fetch(`[https://karaokewondersinbox.fetched.workers.dev/api/inbox?user=$](https://karaokewondersinbox.fetched.workers.dev/api/inbox?user=$){encodeURIComponent(userParam)}`);
    const inboxData = await inboxRes.json();
    return jsonResponse(inboxData, inboxRes.status);
}