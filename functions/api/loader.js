export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const targetPage = url.searchParams.get('page') || '/main';

  try {
    // 1. Fetch status config from static build assets
    const statusAssetUrl = new URL('/files/status.json', url.origin);
    const statusRes = await context.env.ASSETS.fetch(statusAssetUrl);
    
    if (!statusRes.ok) {
      console.warn(`[Loader API] Could not load /files/status.json — HTTP ${statusRes.status}`);
      return Response.json({ allowed: true, warning: 'status_config_missing' });
    }

    const status = await statusRes.json();

    // 2. Global Maintenance Check
    if (status.maintenanceMode) {
      return Response.json({ allowed: false, reason: 'maintenance' });
    }

    // 3. Targeted Page Maintenance Check
    const cleanTarget = targetPage.toLowerCase().replace(/^\/+|\/+$/g, '');

    const isBlocked = status.blockedPages?.some(p => {
      const cleanBlocked = p.toLowerCase().replace(/^\/+|\/+$/g, '');
      // Only block if target page matches or resides within a blocked path prefix
      return cleanBlocked.length > 0 && cleanTarget.startsWith(cleanBlocked);
    });

    if (isBlocked) {
      return Response.json({ allowed: false, reason: 'blocked' });
    }

    // Page clear to load
    return Response.json({ allowed: true });

  } catch (err) {
    console.error('[Loader API Error]:', err);
    return Response.json({ allowed: true });
  }
}