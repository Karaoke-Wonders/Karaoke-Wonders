export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const skipFlag = url.searchParams.get('skip_loader') === 'true';

  const isStaticAsset = /\.(css|js|json|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(path);

  // Check specific routes first, then general static assets
  const isApi = path.startsWith('/api/');
  const isLoading = path.startsWith('/loading');
  const isStatusFile = path.endsWith('status.json');

  if (isStaticAsset || isApi || isLoading || isStatusFile || skipFlag) {
    let bypassReason = 'Unknown';
    if (isStatusFile) bypassReason = 'Status Config File';
    else if (isApi) bypassReason = 'API Endpoint Request';
    else if (isLoading) bypassReason = 'Loading Page Request';
    else if (skipFlag) bypassReason = 'skip_loader=true Flag Present';
    else if (isStaticAsset) bypassReason = 'Static Asset File';

    console.log(`[Middleware BYPASS] Path: "${path}${url.search}" | Reason: ${bypassReason}`);
    return context.next();
  }

  // Redirect HTML page requests to loading.html
  const loadingUrl = new URL('/loading.html', request.url);
  loadingUrl.searchParams.set('page', path + url.search);

  console.log(`[Middleware REDIRECT] Path: "${path}${url.search}" -> Target: "${loadingUrl.toString()}"`);

  return Response.redirect(loadingUrl.toString(), 302);
}