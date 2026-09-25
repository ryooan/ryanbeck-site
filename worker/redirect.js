import SITE from '../site.config.json';
export default { fetch(request) {
  const url = new URL(request.url);
  const target = new URL(SITE.origin);
  url.protocol = target.protocol;
  url.host = target.host;
  return Response.redirect(url.toString(), 301);
} };
