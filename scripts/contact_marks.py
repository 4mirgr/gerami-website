"""Decorate visible contact words in the baked public HTML, including no-script views."""
from html import escape, unescape
from html.parser import HTMLParser
import re

LOGOS = {'linkedin': 'linkedin.e14ad9c44fe2388e.svg', 'gmail': 'gmail.4e4a8dd4379ec84a.svg'}
TOKENS = re.compile(
    r"(?:https?://|www\.|mailto:|tel:)\S+|[\w.!#$%&'*+/=?^_`{|}~-]+@[\w-]+(?:\.[\w-]+)+"
    r"|(?:[\w-]+\.)+[a-z]{2,}(?:/\S*)?|(?<!\w)(?:(?P<linkedin>linkedin|لینکدین|لینکداین)"
    r"|(?P<mail>e[-‐‑]?mails?|gmail|ای[‌ -]?میل|جی[‌ -]?میل|پست\s+الکترونیکی?))(?!\w)", re.I)
VOID = set('area base br col embed hr img input link meta param source track wbr'.split())
SKIP = set('script style title template textarea select pre code svg math'.split())


def mark_text(value):
    pieces = []
    offset = 0
    for hit in TOKENS.finditer(value):
        raw = hit[0]
        address = re.fullmatch(r"[^@\s:]+@gmail\.com", raw, re.I)
        if not (address or hit.lastgroup):
            continue
        brand = 'linkedin' if hit.lastgroup == 'linkedin' else 'gmail'
        icon = f'<img class="{brand}-mark" src="/assets/optimized/{LOGOS[brand]}" alt="" width="13" height="13" loading="lazy">'
        direction = ' dir="ltr"' if address else ''
        pieces.extend((escape(value[offset:hit.start()], quote=False), f'<span class="contact-word"{direction}>{icon}{escape(raw, quote=False)}</span>'))
        offset = hit.end()
    if not pieces:
        return None
    pieces.append(escape(value[offset:], quote=False))
    return '<span data-contact-copy>' + ''.join(pieces) + '</span>'


class PublicContactMarks(HTMLParser):
    def __init__(self, document):
        super().__init__(convert_charrefs=False)
        self.document = document
        self.runs = []
        self.lines = [0, *(m.end() for m in re.finditer('\n', document))]
        self.changes = []
        self.stack = []

    def edit(self, original, result):
        line, column = self.getpos()
        start = self.lines[line - 1] + column
        self.changes.append((start, start + len(original), result))

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        visible = self.stack[-1][1] if self.stack else False
        if visible and tag == 'img' and set(attrs.get('class', '').split()) & {'linkedin-mark', 'gmail-mark'}:
            self.edit(self.get_starttag_text(), '')
        if tag not in VOID:
            active = (visible or tag == 'body') and tag not in SKIP and 'data-contact-copy' not in attrs
            active &= attrs.get('aria-hidden') != 'true' and attrs.get('contenteditable', 'false') == 'false'
            self.stack.append((tag, active))

    def handle_endtag(self, tag):
        for index in range(len(self.stack)-1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        if not self.stack or not self.stack[-1][1]:
            return
        line, column = self.getpos()
        start = self.lines[line - 1] + column
        end = start + len(data)
        if self.runs and self.runs[-1][1] == start:
            self.runs[-1][1] = end
        else:
            self.runs.append([start, end])

    def handle_entityref(self, name):
        line, column = self.getpos()
        start = self.lines[line - 1] + column
        end = start + len(name) + 1
        self.handle_data(self.document[start:end + self.document.startswith(';', end)])

    def handle_charref(self, name):
        self.handle_entityref('#' + name)


def mark_public_copy(document):
    parser = PublicContactMarks(document)
    parser.feed(document)
    parser.close()
    for start, end in parser.runs:
        replacement = mark_text(unescape(document[start:end]))
        if replacement:
            parser.changes.append((start, end, replacement))
    for start, end, replacement in sorted(parser.changes, reverse=True):
        document = document[:start] + replacement + document[end:]
    return document
