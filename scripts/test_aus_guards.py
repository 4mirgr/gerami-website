"""AUS releases with invalid data or broken JavaScript must never be assembled."""
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('aus_build', ROOT / 'scripts/build_cloudflare.py')
build = importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)


class AUSReleaseRulesTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original = Path('/workspace/immi_AUS')
        cls.intmed = Path('/workspace/intMed-study-plan')
        if not cls.original.is_dir() or not (cls.intmed / 'content/taxonomy.json').is_file():
            raise unittest.SkipTest('Requires the inspected upstream checkouts')
        cls.temporary = tempfile.TemporaryDirectory(prefix='gerami-aus-tests-')
        cls.base = Path(cls.temporary.name)
        cls.source = cls.base / 'aus'
        cls.source.mkdir()
        for name in ('data', 'scripts'):
            shutil.copytree(cls.original / name, cls.source / name)
        for name in ('index.html', 'app.js', 'styles.css', 'dashboard.css', 'README.md'):
            shutil.copy2(cls.original / name, cls.source / name)
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
        cls.git('commit','-qm','Synthetic AUS fixture')

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls,'temporary'):
            cls.temporary.cleanup()

    def setUp(self):
        self.git('restore','--source='+self.good,'--staged','--worktree','.')
        self.git('commit','--allow-empty','-qm','Reset disposable fixture')
        self.saved_pins = build.PINS

    def tearDown(self):
        build.PINS = self.saved_pins

    def pin_fixture(self):
        pins = json.loads(self.saved_pins.read_text())
        pins['aus']['commit'] = self.git('rev-parse','HEAD')
        path = self.base / 'pins.json'
        path.write_text(json.dumps(pins))
        build.PINS = path

    def test_invalid_upstream_task_data_blocks_release(self):
        path = self.source / 'data/tasks.json'
        data = json.loads(path.read_text())
        data[0]['prio'] = 'invalid-priority'
        path.write_text(json.dumps(data,ensure_ascii=False))
        self.commit()
        self.pin_fixture()
        output = self.base / 'bad-data-output'
        with self.assertRaisesRegex(RuntimeError, 'AUS validation failed'):
            build.assemble({'intmed':self.intmed,'aus':self.source},output)
        self.assertFalse(output.exists())

    def test_broken_application_javascript_blocks_release(self):
        (self.source / 'app.js').write_text('function broken( {\n')
        self.commit()
        self.pin_fixture()
        output = self.base / 'bad-code-output'
        with self.assertRaisesRegex(RuntimeError, 'AUS validation failed'):
            build.assemble({'intmed':self.intmed,'aus':self.source},output)
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
