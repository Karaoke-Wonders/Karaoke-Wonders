export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);
  const path = url.pathname;

  // Bypass asset files (CSS, JS, images, status.json) and loading page itself
  if (
    path.startsWith('/css') ||
    path.startsWith('/js') ||
    path.startsWith('/image') ||
    path.includes('.') ||
    path === '/loading.html' ||
    path === '/files/status.json' ||
    url.searchParams.get('skip_loader') === 'true'
  ) {
    return context.next();
  }

  // Redirect page request to dedicated loading page with target page as parameter
  const loadingUrl = new URL('/loading.html', request.url);
  loadingUrl.searchParams.set('page', path + url.search);

  return Response.redirect(loadingUrl.toString(), 302);
}