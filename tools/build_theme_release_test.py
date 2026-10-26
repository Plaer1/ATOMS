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

    def test_readme_media_is_packaged_without_neighboring_private_files(self):
        with tempfile.TemporaryDirectory(prefix='atoms-readme-release-') as directory:
            root = Path(directory) / 'theme'
            media = root / 'docs' / 'media'
            media.mkdir(parents=True)
            (root / 'skin.json').write_text('{"version":"test"}')
            (root / 'README.md').write_text('![Library](docs/media/library.png)\n')
            (media / 'library.png').write_bytes(b'public image fixture')
            (media / '.draft.png').write_bytes(b'private draft fixture')
            (root / 'docs' / 'private.md').write_text('private sibling fixture')
            (root / '.clanker').mkdir()
            (root / '.clanker' / 'notes.txt').write_text('private working fixture')
            personal = {name: b'personal config fixture ' + name.encode() for name in builder.SAFE_CONFIGS}
            for name, content in personal.items():
                (root / name).write_bytes(content)
            (media / 'linked.png').symlink_to(root / 'config.css')

            output = Path(directory) / 'ATOMS.zip'
            builder.build(output, root)
            with zipfile.ZipFile(output) as archive:
                self.assertIn('docs/media/library.png', archive.namelist())
                self.assertEqual(archive.read('docs/media/library.png'), b'public image fixture')
                for excluded in ('docs/private.md', 'docs/media/.draft.png', 'docs/media/linked.png', '.clanker/notes.txt'):
                    self.assertNotIn(excluded, archive.namelist())
                for name in personal:
                    self.assertEqual(archive.read(name), builder.SAFE_CONFIGS[name])
            self.assertEqual(personal, {name: (root / name).read_bytes() for name in personal})


if __name__ == '__main__':
    unittest.main()
