import importlib.util
import tempfile
import unittest
import zipfile
from pathlib import Path

spec = importlib.util.spec_from_file_location('builder', Path(__file__).with_name('build_theme_release.py'))
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class ReleaseTest(unittest.TestCase):
    def test_missing_runtime_dependency_is_rejected(self):
        files = builder.release_files()
        del files['config.js']
        with self.assertRaisesRegex(ValueError, 'unpackaged file'):
            builder.validate_references(files)

    def test_runtime_paths_and_private_files(self):
        files = builder.release_files()
        builder.validate_references(files)
        for name in ('config.css', 'config.js'):
            self.assertEqual(files[name], builder.SAFE_CONFIGS[name])
        for name in ('customs.dat', 'test.html', 'pink-css-converter.html', 'metadata.json', 'package.json', 'js/utilities/domDumperChild.js'):
            self.assertNotIn(name, files)
        self.assertFalse(any(name.startswith(('tools/', '.codex/', 'node_modules/', 'dist/')) for name in files))
        self.assertIn('js/utilities/restartMenus.js', files)
        self.assertIn('css/gameArtworkFallback.css', files)

    def test_atomic_valid_archive_and_config_preservation(self):
        before = {name: (builder.ROOT / name).read_bytes() for name in builder.SAFE_CONFIGS}
        with tempfile.TemporaryDirectory(prefix='atoms-release-test-') as directory:
            output = Path(directory) / 'ATOMS.zip'
            output.write_bytes(b'old archive')
            builder.build(output)
            with zipfile.ZipFile(output) as archive:
                self.assertIsNone(archive.testzip())
                self.assertEqual(archive.read('config.js'), builder.SAFE_CONFIGS['config.js'])
                self.assertEqual(set(archive.namelist()), set(builder.release_files()))
            self.assertFalse(list(Path(directory).glob('.atoms-release-*')))
        self.assertEqual(before, {name: (builder.ROOT / name).read_bytes() for name in before})


if __name__ == '__main__':
    unittest.main()
