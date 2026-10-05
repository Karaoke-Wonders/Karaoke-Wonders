export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Regex to check for non-HTML static asset extensions
  const isStaticAsset = /\.(css|js|json|png|jpg|jpeg|gif|svg|ico|webp|woff|woff2|ttf|eot)$/i.test(path);

  // 2. Bypass static assets, status.json, loading page, and explicitly skipped requests
  if (
    isStaticAsset ||
    path === '/loading.html' ||
    path === '/files/status.json' ||
    url.searchParams.get('skip_loader') === 'true'
  ) {
    return context.next();
  }

  // 3. Redirect all HTML page requests to loading.html
  const loadingUrl = new URL('/loading.html', request.url);
  loadingUrl.searchParams.set('page', path + url.search);

  return Response.redirect(loadingUrl.toString(), 302);
}