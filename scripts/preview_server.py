"""Source preview: static pages plus an anonymous CMS session response.

Real identity is tested against the existing verified CMS session in
production. This preview never fabricates or persists a signed-in identity.
"""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlsplit


class Preview(SimpleHTTPRequestHandler):
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
