import assert from 'assert';
import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '..');
const sourceRoots = ['components', 'pages', 'layouts', 'plugins', 'store', 'utils'];
const expected = new Set<string>();

function collectIcons(dir: string) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const file = path.join(dir, entry.name);
		if (entry.isDirectory()) collectIcons(file);
		else if (/\.(vue|ts|js)$/.test(entry.name)) {
			const source = fs.readFileSync(file, 'utf8');
			for (const match of source.matchAll(/mdi-[a-z0-9-]+/g)) {
				expected.add(match[0]);
			}
		}
	}
}

for (const sourceRoot of sourceRoots) {
	const dir = path.join(root, sourceRoot);
	if (fs.existsSync(dir)) collectIcons(dir);
}

const vuetifyPreset = fs.readFileSync(
	path.join(root, 'node_modules/vuetify/lib/services/icons/presets/mdi.js'),
	'utf8'
);
for (const match of vuetifyPreset.matchAll(/mdi-[a-z0-9-]+/g)) expected.add(match[0]);

const subsetCss = fs.readFileSync(path.join(root, 'assets/mdi.scss'), 'utf8');
const included = new Set(Array.from(subsetCss.matchAll(/\.mdi-([a-z0-9-]+)::before/g), match => `mdi-${match[1]}`));
const missing = Array.from(expected).filter(icon => !included.has(icon)).sort();
assert.deepStrictEqual(missing, [], `Regenerate the MDI subset; missing: ${missing.join(', ')}`);

const fontSize = fs.statSync(path.join(root, 'assets/fonts/materialdesignicons-subset.woff2')).size;
assert.ok(fontSize < 100_000, `MDI subset unexpectedly large: ${fontSize} bytes`);

console.log(`MDI subset tests passed (${included.size} icons, ${fontSize} bytes)`);
