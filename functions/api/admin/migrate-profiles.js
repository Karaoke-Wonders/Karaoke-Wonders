import { authorizeAdminRequest, jsonResponse, migrateAllAccountProfiles } from '../../_middleware/utils.js';

export async function onRequestPost({ request, env }) {
    const authorization = await authorizeAdminRequest(request, env);
    if (authorization instanceof Response) return authorization;

    try {
        const result = await migrateAllAccountProfiles(env);
        return jsonResponse({
            success: true,
            message: 'Account profiles migrated to the new format.',
            ...result
        });
    } catch (error) {
        console.error('[migrate-profiles] Migration failed:', error.message);
        return jsonResponse({ error: 'Profile migration failed.' }, 500);
    }
}
