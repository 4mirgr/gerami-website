"""Real-checkout regression: invalid/stale canonical content must block assembly."""
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('cloudflare_build', ROOT / 'scripts/build_cloudflare.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class IntMedRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = Path('/workspace/intMed-study-plan')
        cls.aus = Path('/workspace/immi-arash-amir')
        if not (cls.original / 'content/taxonomy.json').is_file() or not cls.aus.is_dir():
            raise unittest.SkipTest('Integration fixtures require the inspected upstream checkouts')
        cls.temporary = tempfile.TemporaryDirectory(prefix='gerami-guard-tests-')
        cls.base = Path(cls.temporary.name)
        cls.source = cls.base / 'intmed'
        cls.source.mkdir()
        for name in ('docs', 'content', 'scripts', 'backend'):
            shutil.copytree(cls.original / name, cls.source / name, ignore=shutil.ignore_patterns('__pycache__'))
        shutil.copy2(cls.original / 'AGENTS.md', cls.source / 'AGENTS.md')
        subprocess.run(['git','init','-q',str(cls.source)],check=True)
        cls.git('config','user.name','Fixture')
        cls.git('config','user.email','fixture@example.invalid')
        cls.commit()
        cls.good = cls.git('rev-parse','HEAD')

    @classmethod
    def git(cls, *args):
        return subprocess.check_output(['git','-C',str(cls.source),*args],text=True).strip()

    @classmethod
    def commit(cls):
        cls.git('add','-A')
        cls.git('commit','-qm','Synthetic release fixture')

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls,'temporary'):
            cls.temporary.cleanup()

    def setUp(self):
        # Reset only the test-owned disposable checkout, never an upstream checkout.
        self.git('restore','--source='+self.good,'--staged','--worktree','.')
        self.git('commit','--allow-empty','-qm','Reset fixture')
        self.saved_pins = build.PINS

    def tearDown(self):
        build.PINS = self.saved_pins

    def pins_for_fixture(self):
        pins = json.loads(self.saved_pins.read_text())
        pins['intmed']['commit'] = self.git('rev-parse','HEAD')
        path = self.base / 'pins.json'
        path.write_text(json.dumps(pins))
        build.PINS = path

    def test_committed_invalid_canonical_topic_blocks_build(self):
        topic = next((self.source / 'content').glob('*/*/data.json'))
        data = json.loads(topic.read_text())
        data['category'] = 'nonexistent-category'
        topic.write_text(json.dumps(data,ensure_ascii=False))
        self.commit()
        self.pins_for_fixture()
        output = self.base / 'invalid-output'
        with self.assertRaisesRegex(RuntimeError, 'IntMed validation failed'):
            build.assemble({'intmed':self.source,'aus':self.aus},output)
        self.assertFalse(output.exists(),'A rejected release must leave no publishable artifact')

    def test_committed_stale_generated_content_blocks_build(self):
        taxonomy = self.source / 'docs/content/taxonomy.json'
        taxonomy.write_text('{"categories":[]}')
        self.commit()
        self.pins_for_fixture()
        output = self.base / 'stale-output'
        with self.assertRaisesRegex(RuntimeError, 'IntMed validation failed'):
            build.assemble({'intmed':self.source,'aus':self.aus},output)
        self.assertFalse(output.exists(),'Stale generated files must not be published')

    def test_failed_upstream_account_regression_blocks_build(self):
        regression = self.source / 'scripts/backend_unit_test.mjs'
        regression.write_text("throw new Error('Synthetic account-regression failure');\n")
        self.commit()
        self.pins_for_fixture()
        output = self.base / 'account-failure-output'
        with self.assertRaisesRegex(RuntimeError, 'IntMed validation failed'):
            build.assemble({'intmed':self.source,'aus':self.aus},output)
        self.assertFalse(output.exists())

    def test_uncommitted_project_rules_block_build(self):
        rules = self.source / 'AGENTS.md'
        rules.write_text(rules.read_text()+'\nUnreviewed local rule change\n')
        self.pins_for_fixture()
        with self.assertRaisesRegex(ValueError, 'local changes'):
            build.assemble({'intmed':self.source,'aus':self.aus},self.base/'dirty-output')


if __name__ == '__main__':
    unittest.main()
