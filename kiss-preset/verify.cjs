// Read-only composition regression checks against the running DSH installation.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const install = process.env.DSH_INSTALL_DIR;
assert.ok(install, 'Run with the DSH-provided Electron runtime');
const hostRequire = createRequire(path.join(install, 'package.json'));
const yaml = hostRequire('js-yaml');
const schema = yaml.DEFAULT_SCHEMA.extend([
  new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    construct: source => ({ $js: source }),
  }),
]);
const load = file => yaml.load(fs.readFileSync(file, 'utf8'), { schema });
const standardPath = path.join(path.dirname(hostRequire.resolve('@deepseek-ai/dsh-web-app/package.json')), 'presets', 'standard.patch.yml');
const standardBytes = fs.readFileSync(standardPath);
const standard = load(standardPath)[0].insert[0];
const patches = load(path.join(__dirname, 'cordis.patch.yml'));
assert.equal(patches.length, 1, 'Only add a declaration; never override the host');
assert.deepEqual(Object.keys(patches[0]), ['insert']);
assert.equal(patches[0].insert.length, 1);
const row = patches[0].insert[0];
assert.equal(row.id, 'preset-kiss');
assert.equal(row.name, '@deepseek-ai/dsh-agent-preset');
assert.equal(row.config.id, 'kiss');
assert.equal(row.config.name, 'KISS模式');
const removed = ['time-context', 'tool-schedule', 'command-goal', 'tool-goal', 'planning', 'delegation', 'tool-todo', 'tool-office', 'tool-plugin-market'];
const expected = standard.config.plugins.filter(plugin => !removed.includes(plugin.id));
assert.deepEqual(row.config.plugins, expected, 'Retained rows, persona, expressions and settings must exactly match Standard');
assert.equal(row.config.plugins.length, 14);
const plugins = row.config.plugins;
assert.deepEqual(plugins.find(p => p.id === 'persona').config, {
  prefix: 'You are a coding agent powered by the {{model}} model.',
});
assert.equal(plugins.find(p => p.id === 'agent-instructions').config.maxBytes, 65536);
for (const platform of ['win32', 'linux', 'darwin']) {
  const platformProcess = { platform };
  const disabled = plugin => new Function('process', `return (${plugin.disabled.$js});`)(platformProcess);
  assert.equal(disabled(plugins.find(p => p.id === 'tool-bash')), platform === 'win32');
  assert.equal(disabled(plugins.find(p => p.id === 'tool-pwsh')), platform !== 'win32');
}
const manager = plugins.find(p => p.id === 'tool-plugin-manager');
for (const profile of [undefined, { name: 'desktop' }]) {
  assert.equal(new Function('ctx', `return (${manager.disabled.$js});`)({ get: () => profile }), !profile);
}
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
assert.equal(manifest.engines.dsh, JSON.parse(fs.readFileSync(path.join(install, 'package.json'), 'utf8')).version);
assert.ok(!manifest.dependencies && !manifest.scripts, 'No dependencies or installation scripts');
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
for (const locale of ['en', 'zh']) {
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'locale', `${locale}.json`), 'utf8')).meta;
  assert.equal(meta.title, 'KISS模式');
  assert.ok(meta.description.length > 30);
}
assert.ok(fs.statSync(path.join(__dirname, 'icon.svg')).size < 256 * 1024);
assert.deepEqual(fs.readFileSync(standardPath), standardBytes, 'Standard must remain untouched');
console.log(JSON.stringify({ result: 'PASS', hostVersion: manifest.engines.dsh, retained: plugins.map(p => p.id), removed, persona: plugins[0].config.prefix, extraPersonaText: false, defaultPresetModified: false }, null, 2));
