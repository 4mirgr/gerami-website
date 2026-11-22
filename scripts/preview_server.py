"""Source preview: static pages plus an anonymous CMS session response.

Real identity is tested against the existing verified CMS session in
production. This preview never fabricates or persists a signed-in identity.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit, unquote
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parent.parent
SEO_CACHE = tempfile.TemporaryDirectory(prefix="gerami-seo-preview-")
SEO_STAMP = None


class Preview(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        global SEO_STAMP
        route = unquote(urlsplit(path).path)
        if route.startswith(('/topics/', '/articles/')):
            stamp = tuple((ROOT / name).stat().st_mtime_ns for name in ('content/articles.json', 'backend/editorial/functions/gerami-editorial/taxonomy.json'))
            if stamp != SEO_STAMP:
                from editorial_seo import generate
                generate(ROOT, Path(SEO_CACHE.name))
                SEO_STAMP = stamp
            target = (Path(SEO_CACHE.name) / route.lstrip('/')).resolve()
            if target.is_relative_to(Path(SEO_CACHE.name)):
                return str(target)
        return super().translate_path(path)

    def do_GET(self):
        if urlsplit(self.path).path in ('/api/cms/session','/api/account/session'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(b'{"authenticated":false}')
            return
        super().do_GET()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1', 4173), Preview).serve_forever()
