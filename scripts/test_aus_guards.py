"""Authenticated AUS releases must reject broken authorization before assembly."""
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
        cls.original = Path('/workspace/immi-arash-amir')
        cls.intmed = Path('/workspace/intMed-study-plan')
        if not cls.original.is_dir() or not (cls.intmed / 'content/taxonomy.json').is_file():
            raise unittest.SkipTest('Requires the inspected upstream checkouts')
        cls.temporary = tempfile.TemporaryDirectory(prefix='gerami-aus-tests-')
        cls.base = Path(cls.temporary.name)
        cls.source = cls.base / 'aus'
        cls.source.mkdir()
        for name in ('cloud', 'tests', 'library'):
            shutil.copytree(cls.original / name, cls.source / name)
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

    def test_disabled_login_requirement_blocks_release(self):
        worker = self.source / 'cloud/worker.mjs'
        text = worker.read_text()
        self.assertIn('authRequired:true', text)
        worker.write_text(text.replace('authRequired:true', 'authRequired:false', 1))
        self.commit()
        self.pin_fixture()
        output = self.base / 'no-login-output'
        with self.assertRaisesRegex(RuntimeError, 'AUS validation failed'):
            build.assemble({'intmed': self.intmed, 'aus': self.source}, output)
        self.assertFalse(output.exists())

    def test_unauthenticated_private_access_blocks_release(self):
        worker = self.source / 'cloud/worker.mjs'
        text = worker.read_text()
        needle = "if (!authorization || !/^Bearer [^\\s]+$/.test(authorization)) throw new ApiError(401, 'Sign in required');"
        self.assertIn(needle, text)
        worker.write_text(text.replace(needle, "if (!authorization) return json({profiles:[]});", 1))
        self.commit()
        self.pin_fixture()
        output = self.base / 'no-authorization-output'
        with self.assertRaisesRegex(RuntimeError, 'AUS validation failed'):
            build.assemble({'intmed': self.intmed, 'aus': self.source}, output)
        self.assertFalse(output.exists())


if __name__ == '__main__':
    unittest.main()
