"""Contract tests using synthetic inputs; no accounts or external requests."""
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from aus_frontend_adapter import BASE, prepare_and_build, prepare_source


AUTH = '''function loadConfig(result) {
  if (
    result.mode === "local_demo" && result.authRequired === false &&
    ["localhost", "127.0.0.1"].includes(location.hostname)
  ) setConfig(result);
  else if (
    result.authRequired === true && result.supabaseUrl && result.publishableKey &&
    new URL(result.supabaseUrl).protocol === "https:"
  ) setConfig(result);
  else throw Error("closed");
}
function view() {
  if (config?.mode === "local_demo")
    return children({cloud: false, initialPerson: "arash", onSignOut: logout});
  if (session) return children({cloud: true, initialPerson: session.profileId});
  return "login";
}
const signup = `${config.supabaseUrl}/auth/v1/signup?redirect_to=${encodeURIComponent(location.origin)}`;
const image = <img src="/brand-aa-180.png"/>;
'''


class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        files = {
            "src/api.js": 'let bearer=""; export async function apiResponse(path, options={}) {return fetch("/api/" + path, {headers:{Authorization:`Bearer ${bearer}`},...options});}',
            "src/auth.jsx": AUTH,
            "src/main.jsx": '<img src="/brand-aa-64.png"/>',
            "src/linkedin-panel.jsx": "fetch('/brand-aa-512.png',{cache:'force-cache'});",
            "src/style.css": '@import url("https://fonts.googleapis.com/css2?family=Vazirmatn");\nbody{font-family: Vazirmatn, Tahoma, sans-serif;}',
            "public/site.webmanifest": json.dumps({"start_url": "/", "icons": [{"src": "/brand-aa-192.png"}]}),
            "public/privacy.html": '<a href="/">app</a><a href="https://example.org/">source</a>',
            "public/brand-aa-64.png": "synthetic-public-image",
            "index.html": '<script type="module" src="/src/main.jsx"></script>',
            "package.json": '{"scripts":{"build":"vite build"}}',
            "package-lock.json": '{}',
            "vite.config.js": 'export default {};',
            "cloud/gp-discovery-sources.json": '[]',
            "cloud/evidence-deadline.mjs": 'export const evidenceClosed=()=>false;',
            "library/sources.json": '[]',
            "private/personal.json": 'DO NOT PUBLISH',
            ".env": 'SECRET=DO_NOT_READ',
            "cloud/worker.mjs": 'PRIVATE_BACKEND',
        }
        for name, content in files.items():
            path = self.source / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    def test_public_deadline_helper_is_included_without_backend(self):
        destination = self.root / "deadline"
        prepare_source(self.source, destination)
        self.assertEqual((destination / "cloud/evidence-deadline.mjs").read_text(), "export const evidenceClosed=()=>false;")
        self.assertFalse((destination / "cloud/worker.mjs").exists())

    def test_paths_auth_and_public_inputs_preserve_original(self):
        before = {str(p.relative_to(self.source)): p.read_bytes()
                  for p in self.source.rglob("*") if p.is_file()}
        work = self.root / "work"
        prepare_source(self.source, work)
        self.assertEqual(before, {str(p.relative_to(self.source)): p.read_bytes()
                                 for p in self.source.rglob("*") if p.is_file()})
        self.assertNotIn('"/api/"', (work / "src/api.js").read_text())
        self.assertIn('import.meta.env.BASE_URL + "api/"', (work / "src/api.js").read_text())
        self.assertIn('Authorization:`Bearer ${bearer}`', (work / "src/api.js").read_text())
        auth = (work / "src/auth.jsx").read_text()
        self.assertNotIn("local_demo", auth)
        self.assertIn('result.mode === "cloud"', auth)
        self.assertIn("location.origin + import.meta.env.BASE_URL", auth)
        for relative in ["src/main.jsx", "src/auth.jsx", "src/linkedin-panel.jsx"]:
            self.assertIn('import.meta.env.BASE_URL + "brand-aa-', (work / relative).read_text())
        self.assertEqual((work / 'cloud/evidence-deadline.mjs').read_text(), (self.source / 'cloud/evidence-deadline.mjs').read_text())
        self.assertNotIn("fonts.googleapis.com", (work / "src/style.css").read_text())
        manifest = json.loads((work / "public/site.webmanifest").read_text())
        self.assertEqual(manifest["start_url"], BASE)
        self.assertEqual(manifest["scope"], BASE)
        self.assertEqual(manifest["icons"][0]["src"], BASE + "brand-aa-192.png")
        self.assertIn('href="/aus/"', (work / "public/privacy.html").read_text())
        for private in ["private", ".env", "cloud/worker.mjs"]:
            self.assertFalse((work / private).exists())

    def test_recovery_redirect_is_bound_to_mount_and_unknown_helpers_fail_closed(self):
        auth = "import { recoveryRedirect } from './auth-recovery.mjs';\n" + AUTH.replace('encodeURIComponent(location.origin)', 'encodeURIComponent(recoveryRedirect(location.href))')
        auth += '\nconst recover = encodeURIComponent(recoveryRedirect(location.href));\n'
        (self.source / 'src/auth.jsx').write_text(auth)
        helper = self.source / 'src/auth-recovery.mjs'
        helper.write_text("export function recoveryRedirect(href) { const url = new URL(href); return url.origin + (url.pathname === '/aus' || url.pathname.startsWith('/aus/') ? '/aus/' : '/'); }")
        work = self.root / 'recovery-work'
        prepare_source(self.source, work)
        self.assertIn('return url.origin + import.meta.env.BASE_URL;', (work / 'src/auth-recovery.mjs').read_text())
        self.assertNotIn('local_demo', (work / 'src/auth.jsx').read_text())
        helper.write_text("export function recoveryRedirect() { return 'https://unreviewed.invalid/'; }")
        with self.assertRaisesRegex(RuntimeError, 'contract changed'):
            prepare_source(self.source, self.root / 'unreviewed-work')

    def test_cloud_gate_rejects_demo_incomplete_and_http_configuration(self):
        work = self.root / "work"
        prepare_source(self.source, work)
        # Execute the transformed, actual config guard, without React/network.
        auth = (work / "src/auth.jsx").read_text()
        function = auth[:auth.index("function view()")]
        cases = [
            {"mode": "cloud", "authRequired": True, "supabaseUrl": "https://example.invalid/aus/supabase", "publishableKey": "public-only"},
            {"mode": "local_demo", "authRequired": False},
            {"mode": "local_demo", "authRequired": True, "supabaseUrl": "https://example.invalid", "publishableKey": "public-only"},
            {"mode": "cloud", "authRequired": True},
            {"mode": "cloud", "authRequired": True, "supabaseUrl": "http://example.invalid", "publishableKey": "public-only"},
        ]
        script = ('let accepted=false; function setConfig(){accepted=true;}\n' + function
                  + '\nconsole.log(JSON.stringify(' + json.dumps(cases)
                  + '.map(c=>{accepted=false;try{loadConfig(c)}catch{}return accepted})));')
        result = subprocess.run(["node", "--input-type=module", "-e", script],
                                check=True, text=True, capture_output=True)
        self.assertEqual(json.loads(result.stdout), [True, False, False, False, False])

    def test_frozen_build_copies_dist_only(self):
        calls = []

        def fake_run(command, *, cwd, check):
            calls.append(command)
            self.assertTrue(check)
            self.assertFalse((cwd / ".env").exists())
            if command[1:3] == ["run", "build"]:
                dist = cwd / "dist"
                dist.mkdir()
                (dist / "index.html").write_text("login shell")

        output = self.root / "output"
        with patch("aus_frontend_adapter.subprocess.run", side_effect=fake_run):
            self.assertEqual(prepare_and_build(self.source, output), output)
        self.assertEqual(calls, [
            ["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"],
            ["npm", "run", "build", "--", "--base=/aus/"],
        ])
        self.assertEqual([p.name for p in output.iterdir()], ["index.html"])

    def test_unknown_auth_contract_and_symlinks_fail_closed(self):
        (self.source / "src/auth.jsx").write_text("changed upstream authentication")
        with self.assertRaisesRegex(RuntimeError, "auth gate contract changed"):
            prepare_source(self.source, self.root / "changed")
        (self.source / "src/auth.jsx").write_text(AUTH)
        (self.source / "src/private-link").symlink_to(self.source / "private/personal.json")
        with self.assertRaisesRegex(RuntimeError, "Linked AUS public input"):
            prepare_source(self.source, self.root / "linked")


if __name__ == "__main__":
    unittest.main()
