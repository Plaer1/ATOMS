import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = fileURLToPath(new URL('../', import.meta.url));
const require = createRequire(import.meta.url);
const postcss = require('postcss');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'skin.json'), 'utf8'));
const errors = [];
const checkFile = name => {
    if (path.isAbsolute(name) || !path.resolve(root, name).startsWith(root) || !fs.existsSync(path.join(root, name))) errors.push(`Missing/invalid theme path: ${name}`);
};
const regex = value => { try { new RegExp(value); } catch { errors.push(`Invalid match regex: ${value}`); } };
for (const patch of manifest.Patches) {
    regex(patch.MatchRegexString);
    for (const key of ['TargetCss', 'TargetJs']) if (patch[key]) checkFile(patch[key]);
}
for (const [name, condition] of Object.entries(manifest.Conditions)) {
    if (!(condition.default in condition.values)) errors.push(`Invalid condition default: ${name}`);
    for (const value of Object.values(condition.values)) for (const key of ['TargetCss', 'TargetJs']) {
        if (!value[key]) continue;
        checkFile(value[key].src);
        for (const match of value[key].affects) regex(match);
    }
}
for (const key of ['Steam-WebKit', 'webkitJS']) checkFile(manifest[key]);
const files = folder => fs.readdirSync(path.join(root, folder), { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(folder, e.name)) : [path.join(folder, e.name)]);
let cssCount = 0, jsCount = 0;
for (const file of files('css').filter(f => f.endsWith('.css'))) {
    try {
        const ast = postcss.parse(fs.readFileSync(path.join(root, file), 'utf8'), { from: file });
        let pastImports = false;
        for (const node of ast.nodes) {
            if (node.type === 'comment') continue;
            if (node.type === 'atrule' && node.name === 'import') {
                if (pastImports) errors.push(`${file}: @import after a style rule would be ignored by Steam.`);
            } else if (!(node.type === 'atrule' && (node.name === 'charset' || (node.name === 'layer' && !node.nodes)))) {
                pastImports = true;
            }
        }
        const relative = value => {
            // Absolute Steam/CDN URLs are not theme-owned files.
            if (!value || /^(?:[a-z]+:|\/|#|var\()/i.test(value)) return;
            checkFile(path.join(path.dirname(file), value.split(/[?#]/)[0]));
        };
        ast.walkAtRules('import', r => relative(r.params.match(/^(?:url\()?['"]?([^'"\s)]+)/)?.[1]));
        ast.walkDecls(d => {
            for (const m of d.value.matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/g)) relative(m[1]);
        });
        cssCount++;
    } catch (e) { errors.push(`${file}: ${e.message}`); }
}
for (const file of files('js').filter(f => f.endsWith('.js') && !f.endsWith('domDumperChild.js'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    const result = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: source, encoding: 'utf8' });
    if (result.status !== 0) errors.push(`${file}: ${result.stderr}`);
    for (const m of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"]([^'"]+)['"]/g)) {
        if (m[1].startsWith('.')) checkFile(path.join(path.dirname(file), m[1]));
    }
    jsCount++;
}
if (manifest.Conditions['Show floating theme toggle?']?.default !== 'no') errors.push('Floating theme toggle must default to no.');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`Theme preflight passed: ${cssCount} CSS files, ${jsCount} JS files, all manifest/import paths and condition defaults; version ${manifest.version}.`);
