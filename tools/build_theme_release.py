#!/usr/bin/env python3
"""Build a runtime-only release, independent of local Git ignore rules."""
import argparse
import json
import os
import posixpath
import re
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SAFE_CONFIGS = {
    "config.css": b"/* Optional local overrides. Copy only your changed variables from css/configDefaults.css. */\n",
    "config.js": b"// Optional local overrides. Export changed values from js/configDefaults.js here.\nexport {};\n",
}
DOCS = ("skin.json", "README.md", "millennium.md", "CHANGELOG.md")
EXCLUDED = {"js/utilities/domDumperChild.js"}


def release_files(root=ROOT):
    files = {}
    for folder in ("css", "js", "data"):
        for path in sorted((root / folder).rglob("*")):
            relative = path.relative_to(root).as_posix()
            if path.is_file() and not path.is_symlink() and relative not in EXCLUDED and not any(p.startswith('.') for p in path.relative_to(root).parts):
                files[relative] = path.read_bytes()
    for name in DOCS:
        if (root / name).is_file():
            files[name] = (root / name).read_bytes()
    files.update(SAFE_CONFIGS)
    return files


def validate_references(files):
    manifest = json.loads(files['skin.json'])
    def walk(value):
        if isinstance(value, dict):
            for key, child in value.items():
                if key in ('TargetCss', 'TargetJs', 'Steam-WebKit', 'webkitJS', 'src') and isinstance(child, str):
                    if child not in files:
                        raise ValueError(f'Missing release entry: {child}')
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)
    walk(manifest)
    for name, content in files.items():
        if not name.endswith(('.js', '.css')):
            continue
        source = re.sub(r'/\*.*?\*/', '', content.decode('utf8'), flags=re.S)
        if name.endswith('.js'):
            references = re.findall(r'(?:\bfrom\s*|\bimport\s*\(?\s*)[\'"]([^\'"]+)[\'"]', source)
            references = [ref for ref in references if ref.startswith('.')]
        else:
            references = re.findall(r'url\(\s*[\'"]?([^\'"\s)]+)', source)
            references += re.findall(r'@import\s+[\'"]([^\'"]+)[\'"]', source)
            references = [ref for ref in references if not re.match(r'^(?:[a-z]+:|/|#|var\()', ref, re.I)]
        for reference in references:
            resolved = posixpath.normpath(posixpath.join(posixpath.dirname(name), re.split(r'[?#]', reference)[0]))
            if resolved not in files:
                raise ValueError(f'{name} references unpackaged file: {reference}')
    return manifest


def build(output, root=ROOT):
    files = release_files(root)
    manifest = validate_references(files)
    output = Path(output).resolve()
    if output == root / 'skin.json' or output.suffix.lower() != '.zip':
        raise ValueError('Output must be a .zip file, not a theme source file.')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Leave the previous archive intact until the new ZIP has been verified.
    handle, temporary = tempfile.mkstemp(prefix='.atoms-release-', suffix='.zip', dir=output.parent)
    os.close(handle)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
            for name, content in sorted(files.items()):
                info = zipfile.ZipInfo(name, (2026, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, content)
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip():
                raise ValueError('Release ZIP failed its integrity check.')
        os.replace(temporary, output)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    print(f"Built {output} ({len(files)} entries; version {manifest['version']}). Local configs were not copied or modified.")
    return output


def main():
    version = json.loads((ROOT / 'skin.json').read_text())['version']
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'dist' / f'ATOMS-{version}.zip')
    args = parser.parse_args()
    build(args.output)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
