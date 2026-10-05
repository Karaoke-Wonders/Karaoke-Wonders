export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const targetPage = url.searchParams.get('page') || '/main';

  try {
    // Fetch current status configuration
    const statusRes = await context.env.ASSETS.fetch(new URL('/files/status.json', url.origin));
    
    if (!statusRes.ok) {
      return Response.json({ allowed: true });
    }

    const status = await statusRes.json();

    // 1. Global Maintenance Mode Check
    if (status.maintenanceMode) {
      return Response.json({ allowed: false, reason: 'maintenance' });
    }

    // 2. Targeted Page Maintenance Check
    const cleanTarget = targetPage.toLowerCase().replace(/^\/+|\/+$/g, '');
    const isBlocked = status.blockedPages?.some(p => {
      const cleanBlocked = p.toLowerCase().replace(/^\/+|\/+$/g, '');
      return cleanBlocked.length > 0 && (cleanTarget.includes(cleanBlocked) || cleanBlocked.includes(cleanTarget));
    });

    if (isBlocked) {
      return Response.json({ allowed: false, reason: 'blocked' });
    }

    // Site and page are open
    return Response.json({ allowed: true });

  } catch (err) {
    console.error('[Loader API Error]:', err);
    // Fall back to allowing traffic if status check fails
    return Response.json({ allowed: true });
  }
}