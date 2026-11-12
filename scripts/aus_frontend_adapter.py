"""Build the real AUS cloud frontend under /aus/, without changing upstream.

Only public frontend inputs enter the isolated build. The existing Worker remains
the backend; no Worker deployment, secrets, personal imports or database is read.
"""
from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

BASE = "/aus/"
PUBLIC_INPUTS = (
    "src", "public", "index.html", "package.json", "package-lock.json",
    "vite.config.js", "cloud/gp-discovery-sources.json", "cloud/evidence-deadline.mjs", "library/sources.json",
)


def _replace_required(path: Path, before: str, after: str) -> None:
    text = path.read_text(encoding="utf-8")
    if text.count(before) != 1:
        raise RuntimeError(f"AUS frontend contract changed: {path.name}")
    path.write_text(text.replace(before, after), encoding="utf-8")


def prepare_source(source: Path, destination: Path) -> None:
    """Copy approved public inputs and adapt only the disposable build copy."""
    source, destination = Path(source).resolve(), Path(destination).resolve()
    if destination == source or source in destination.parents:
        raise ValueError("AUS build copy must be outside the upstream checkout")
    destination.mkdir(parents=True, exist_ok=True)
    if any(destination.iterdir()):
        raise ValueError("AUS build copy must be empty")
    for relative in PUBLIC_INPUTS:
        original = source / relative
        if not original.exists() or original.is_symlink():
            raise RuntimeError(f"Missing or linked AUS public input: {relative}")
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if original.is_dir():
            if any(p.is_symlink() for p in original.rglob("*")):
                raise RuntimeError(f"Linked AUS public input: {relative}")
            shutil.copytree(original, target)
        else:
            shutil.copyfile(original, target)

    _replace_required(destination / "src/api.js", 'fetch("/api/" + path,',
                      'fetch(import.meta.env.BASE_URL + "api/" + path,')
    auth = destination / "src/auth.jsx"
    # Public deployments must never accept the local profile-selector API,
    # including previews/tests served from localhost.
    text = auth.read_text(encoding="utf-8")
    text, config_count = re.subn(
        r'if\s*\(\s*result\.mode === "local_demo".*?else if\s*\(',
        'if (result.mode === "cloud" && ', text, count=1, flags=re.S)
    text, demo_count = re.subn(
        r'  if \(config\?\.mode === "local_demo"\)\s*return children\(\{.*?\}\);\n',
        '', text, count=1, flags=re.S)
    if config_count != 1 or demo_count != 1:
        raise RuntimeError("AUS auth gate contract changed; review before publishing")
    auth.write_text(text, encoding="utf-8")
    if 'encodeURIComponent(location.origin)' in text:
        _replace_required(auth, "encodeURIComponent(location.origin)",
                          "encodeURIComponent(location.origin + import.meta.env.BASE_URL)")
    elif text.count('encodeURIComponent(recoveryRedirect(location.href))') == 2 and "'./auth-recovery.mjs'" in text:
        # Signup and password recovery share the reviewed URL helper. Bind its
        # disposable build copy to Vite's mount; never silently skip the check.
        _replace_required(destination / 'src/auth-recovery.mjs',
                          "return url.origin + (url.pathname === '/aus' || url.pathname.startsWith('/aus/') ? '/aus/' : '/');",
                          'return url.origin + import.meta.env.BASE_URL;')
    else:
        raise RuntimeError('AUS recovery redirect contract changed; review before publishing')

    # JSX public image attributes and the image fetch used by LinkedIn cards.
    for path in (destination / "src").rglob("*"):
        if path.suffix not in {".js", ".jsx", ".mjs", ".css"}:
            continue
        text = path.read_text(encoding="utf-8")
        text = re.sub(r'(src|href)=["\']/(brand-aa-[^"\']+)["\']',
                      r'\1={import.meta.env.BASE_URL + "\2"}', text)
        text = re.sub(r'fetch\((["\'])/(brand-aa-[^"\']+)\1',
                      r'fetch(import.meta.env.BASE_URL + "\2"', text)
        text = re.sub(r'@import\s+url\(["\']https://fonts\.googleapis\.com/[^)]+\);\s*',
                      '', text)
        if path.suffix == ".css":
            text = text.replace("font-family: Vazirmatn, Tahoma, sans-serif;",
                                "font-family: Tahoma, system-ui, sans-serif;")
        path.write_text(text, encoding="utf-8")

    # Vite rewrites index.html asset URLs itself; public HTML/manifest are copied
    # verbatim by Vite, so their own navigation and icon URLs need the base too.
    for path in (destination / "public").rglob("*.html"):
        text = path.read_text(encoding="utf-8")
        text = re.sub(r'(href|src)=(["\'])/(?!/)', r'\1=\2' + BASE, text)
        path.write_text(text, encoding="utf-8")
    manifest = destination / "public/site.webmanifest"
    data = json.loads(manifest.read_text(encoding="utf-8"))
    data["start_url"] = BASE
    data["scope"] = BASE
    for icon in data.get("icons", []):
        if icon["src"].startswith("/") and not icon["src"].startswith("//"):
            icon["src"] = BASE + icon["src"].lstrip("/")
    manifest.write_text(json.dumps(data, ensure_ascii=False) + "\n", encoding="utf-8")


def prepare_and_build(source: Path, output: Path) -> Path:
    """Frozen-lock build into an empty output directory; return that directory."""
    source, output = Path(source).resolve(), Path(output).resolve()
    if output == source or source in output.parents:
        raise ValueError("AUS output must be outside the upstream checkout")
    if output.exists() and any(output.iterdir()):
        raise ValueError("AUS output must be empty")
    with tempfile.TemporaryDirectory(prefix="gerami-aus-frontend-") as temporary:
        work = Path(temporary) / "frontend"
        prepare_source(source, work)
        # No install lifecycle scripts, upstream .env or npmrc are copied.
        subprocess.run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
                       cwd=work, check=True)
        subprocess.run(["npm", "run", "build", "--", "--base=" + BASE],
                       cwd=work, check=True)
        dist = work / "dist"
        if not (dist / "index.html").is_file():
            raise RuntimeError("AUS Vite build did not produce index.html")
        shutil.copytree(dist, output, dirs_exist_ok=True)
    return output
