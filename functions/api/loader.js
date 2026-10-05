export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const skipFlag = url.searchParams.get('skip_loader') === 'true';

  // 1. Regex to check for non-HTML static asset extensions
  const isStaticAsset = /\.(css|js|json|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(path);

  // 2. Bypass static assets, API calls, status.json, loading page, and explicitly skipped requests
  if (
    isStaticAsset ||
    path.startsWith('/api/') ||
    path === '/loading.html' ||
    path === '/files/status.json' ||
    skipFlag
  ) {
    // Determine exact reason for bypass for log visibility
    let bypassReason = 'Unknown';
    if (isStaticAsset) bypassReason = 'Static Asset File';
    else if (path.startsWith('/api/')) bypassReason = 'API Endpoint Request';
    else if (path === '/loading.html') bypassReason = 'Loading Page Request';
    else if (path === '/files/status.json') bypassReason = 'Status Config File';
    else if (skipFlag) bypassReason = 'skip_loader=true Flag Present';

    console.log(`[Middleware BYPASS] Path: "${path}${url.search}" | Reason: ${bypassReason}`);
    return context.next();
  }

  // 3. Redirect all HTML page requests to loading.html
  const loadingUrl = new URL('/loading.html', request.url);
  loadingUrl.searchParams.set('page', path + url.search);

  console.log(`[Middleware REDIRECT] Path: "${path}${url.search}" -> Target: "${loadingUrl.toString()}"`);

  return Response.redirect(loadingUrl.toString(), 302);
}