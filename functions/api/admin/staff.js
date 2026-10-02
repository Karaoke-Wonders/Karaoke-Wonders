import { authorizeAdminRequest, jsonResponse } from '../../_middleware/utils.js';

const STAFF_FILE_PATH = 'files/world-staff.json';

function normalizeName(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ');
}

function sanitizeStaffList(items) {
    const seen = new Set();
    return items
        .map(item => normalizeName(item))
        .filter((item) => item && item.length <= 60)
        .filter((item) => {
            const key = item.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
}

async function fetchStaffFile(env) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    if (!owner || !repo || !token) {
        throw new Error('GitHub repository configuration is missing.');
    }

    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${STAFF_FILE_PATH}`;
    const response = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${token}`,
            'User-Agent': 'Cloudflare-Worker'
        }
    });

    if (response.status === 404) return { exists: false, sha: null, payload: { staff: [] } };
    if (!response.ok) {
        throw new Error(`Failed to read world staff file (${response.status}): ${await response.text()}`);
    }

    const payload = await response.json();
    const encodedContent = typeof payload.content === 'string' ? payload.content : '';
    const decoded = encodedContent ? atob(encodedContent.replace(/\s/g, '')) : '{}';
    let parsed = {};

    try {
        parsed = JSON.parse(decoded);
    } catch {
        parsed = { staff: [] };
    }

    return {
        exists: true,
        sha: payload.sha || null,
        payload: {
            staff: Array.isArray(parsed.staff) ? parsed.staff : []
        }
    };
}

async function saveStaffFile(env, list) {
    const owner = env.GITHUB_OWNER;
    const repo = env.GITHUB_REPO;
    const token = env.GITHUB_TOKEN;
    const branch = env.GITHUB_BRANCH || 'main';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${STAFF_FILE_PATH}`;

    const fileData = await fetchStaffFile(env);
    const payload = JSON.stringify({ staff: sanitizeStaffList(list) }, null, 2);
    const encodedContent = btoa(unescape(encodeURIComponent(payload)));

    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Cloudflare-Worker'
        },
        body: JSON.stringify({
            message: 'Update VRChat world staff list',
            content: encodedContent,
            branch,
            ...(fileData.sha ? { sha: fileData.sha } : {})
        })
    });

    if (!response.ok) {
        throw new Error(`Failed to save world staff file (${response.status}): ${await response.text()}`);
    }

    return sanitizeStaffList(list);
}

export async function onRequestGet({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env, true);
    if (authorization instanceof Response) return authorization;

    try {
        const file = await fetchStaffFile(env);
        const staff = sanitizeStaffList(file.payload.staff || []);
        return jsonResponse({ staff });
    } catch (error) {
        console.error('[admin/staff GET] Failed:', error.message);
        return jsonResponse({ error: 'Unable to load world staff list.' }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env, true);
    if (authorization instanceof Response) return authorization;

    try {
        const body = await request.json().catch(() => ({}));
        const action = body.action === 'remove' ? 'remove' : 'add';
        const rawNames = Array.isArray(body.names)
            ? body.names
            : [body.name ?? body.value ?? ''];

        const candidateNames = rawNames
            .flatMap((name) => String(name).split(','))
            .map(item => normalizeName(item))
            .filter(Boolean);

        if (candidateNames.length === 0) {
            return jsonResponse({ error: 'Please provide at least one VRChat name.' }, 400);
        }

        const currentStaff = sanitizeStaffList((await fetchStaffFile(env)).payload.staff || []);
        const nextStaff = action === 'remove'
            ? currentStaff.filter((name) => !candidateNames.some(candidate => candidate.toLowerCase() === name.toLowerCase()))
            : [...currentStaff, ...candidateNames.filter((candidate) => !currentStaff.some(existing => existing.toLowerCase() === candidate.toLowerCase()))];

        const saved = await saveStaffFile(env, nextStaff);
        return jsonResponse({
            success: true,
            action,
            message: action === 'remove'
                ? 'World staff entry removed.'
                : 'World staff entry added.',
            staff: saved
        });
    } catch (error) {
        console.error('[admin/staff POST] Failed:', error.message);
        return jsonResponse({ error: error.message || 'Unable to update world staff list.' }, 500);
    }
}
