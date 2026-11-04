"""Source fetches must include every tracked file required by upstream validators."""
import importlib.util
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('snapshot_build', ROOT / 'scripts/build_cloudflare.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class SourceSnapshotTest(unittest.TestCase):
    def test_pinned_snapshot_keeps_root_config_and_files_outside_runtime_folders(self):
        with tempfile.TemporaryDirectory(prefix='gerami-fetch-test-') as temporary:
            base = Path(temporary)
            origin = base / 'origin'
            subprocess.run(['git', 'init', '-q', str(origin)], check=True)

            def git(*args):
                return subprocess.check_output(['git', '-C', str(origin), *args], text=True).strip()

            git('config', 'user.name', 'Fixture')
            git('config', 'user.email', 'fixture@example.invalid')
            git('config', 'uploadpack.allowFilter', 'true')
            fixtures = {
                'wrangler.jsonc': '{"name":"intmed-api-proxy","main":"backend/cloudflare/intmed-api-proxy.js"}\n',
                'AGENTS.md': 'Preserve project rules.\n',
                '.github/workflows/validation.yml': 'name: upstream-validation\n',
                'docs/index.html': '<title>IntMed</title>\n',
                'content/taxonomy.json': '{"categories":[]}\n',
                'scripts/validator.mjs': "import fs from 'node:fs'; JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));\n",
                'backend/cloudflare/intmed-api-proxy.js': 'export default {};\n',
            }
            for path, content in fixtures.items():
                file = origin / path
                file.parent.mkdir(parents=True, exist_ok=True)
                file.write_text(content)
            git('add', '-A')
            git('commit', '-qm', 'Complete pinned fixture')
            commit = git('rev-parse', 'HEAD')
            target = build.fetch_source({'repository': origin.as_uri(), 'commit': commit, 'mount': 'intmed', 'public_directory': 'docs'}, base / 'fetched')
            missing = sorted(path for path in fixtures if not (target / path).is_file())
            self.assertEqual(missing, [], 'Upstream tests can depend on files outside the public runtime folders')
            for path, content in fixtures.items():
                self.assertEqual((target / path).read_text(), content, path)
            subprocess.run(['node', 'scripts/validator.mjs'], cwd=target, check=True)
            self.assertEqual(subprocess.check_output(['git', '-C', str(target), 'rev-parse', 'HEAD'], text=True).strip(), commit)


if __name__ == '__main__':
    unittest.main()
