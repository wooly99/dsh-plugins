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
const plugins = row.config.plugins;
const contextRow = plugins.at(-1);
assert.deepEqual(plugins.slice(0, -1), expected, 'Retained rows, persona, expressions and settings must exactly match Standard');
assert.equal(contextRow.id, 'kiss-context');
const hideWebSurface = new Function('ctx', `return (${contextRow.config.hideWebSurface.$js});`);
assert.equal(hideWebSurface({ profileContext: { name: 'desktop' } }), true);
assert.equal(hideWebSurface({ profileContext: { name: 'web' } }), false);
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
const runtimeVersion = hostRequire('./package.json').version;
assert.equal(manifest.engines?.dsh, undefined, 'Do not block KISS on DSH version alone');
assert.ok(!manifest.dependencies && !manifest.scripts, 'No dependencies or installation scripts');
assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml');
for (const locale of ['en', 'zh']) {
  const meta = JSON.parse(fs.readFileSync(path.join(__dirname, 'locale', `${locale}.json`), 'utf8')).meta;
  assert.equal(meta.title, 'KISS模式');
  assert.ok(meta.description.length > 30);
}
assert.ok(fs.statSync(path.join(__dirname, 'icon.svg')).size < 256 * 1024);
assert.deepEqual(fs.readFileSync(standardPath), standardBytes, 'Standard must remain untouched');
async function verifyContext() {
  const { Context } = hostRequire('@deepseek-ai/cordis');
  const { createScope } = hostRequire('@deepseek-ai/dsh-scope');
  const { SystemPrompt, renderContextSections, renderPrompt } = hostRequire('@deepseek-ai/dsh-system-prompt');
  const { SkillRegistry, isModelInvocable } = hostRequire('@deepseek-ai/dsh-skill');
  assert.equal(require.resolve(contextRow.name), path.join(__dirname, 'context.js'));
  assert.ok(manifest.files.includes('context.js'));
  const contextPlugin = require(contextRow.name);
  const ctx = new Context();
  await ctx.plugin(SystemPrompt).await();
  await ctx.plugin(SkillRegistry).await();
  await ctx.plugin(hostRequire('@deepseek-ai/dsh-skill-office')).await();
  const systemPrompt = ctx.get('systemPrompt');
  const skills = ctx.get('skills');
  systemPrompt.section({ name: 'app:web-surface', order: 10, text: 'Web GUI guidance' });
  systemPrompt.context({ name: 'app:web-surface', order: 10, text: 'Web GUI URL' });
  systemPrompt.context({ name: 'harness:source', order: 0, text: 'Harness source' });
  skills.register({ name: 'other-skill', description: 'Unrelated skill', content: 'Unchanged', source: 'runtime' });

  const kissDesktop = {};
  const kissWeb = {};
  const desktopAgent = {};
  const desktopMount = createScope(ctx, kissDesktop);
  const webMount = createScope(ctx, kissWeb);
  const agent = createScope(ctx, desktopAgent, { parent: kissDesktop });
  try {
    await desktopMount.ctx.plugin(contextPlugin, { hideWebSurface: true }).await();
    await webMount.ctx.plugin(contextPlugin, { hideWebSurface: false }).await();
    for (const [scope, hideUrl, hideOffice] of [[{}, false, false], [desktopAgent, true, true], [kissWeb, false, true]]) {
      const assembly = await systemPrompt.assemble({ scope });
      assert.equal(renderPrompt(assembly).includes('Web GUI guidance'), !hideUrl);
      const snapshot = renderContextSections(systemPrompt.refreshContext(assembly, { scope }));
      assert.deepEqual(snapshot.map(section => section.name), hideUrl ? ['harness:source'] : ['harness:source', 'app:web-surface']);
      const officeNames = ['office', 'office-docx', 'office-pptx', 'office-xlsx'];
      const lookup = { cwd: __dirname, scope };
      assert.deepEqual((await skills.list(lookup)).filter(isModelInvocable).map(skill => skill.name),
        hideOffice ? ['other-skill'] : [...officeNames, 'other-skill']);
      for (const name of officeNames) {
        const original = await skills.get(name, { cwd: __dirname });
        const loaded = await skills.get(name, lookup);
        assert.ok(original.content.length > 0);
        assert.deepEqual(loaded, { ...original, invocation: { modelInvocable: !hideOffice, userInvocable: true } });
      }
    }
  } finally {
    await agent.dispose();
    await webMount.dispose();
    await desktopMount.dispose();
  }
}

verifyContext().then(() => {
  console.log(`PASS: DSH ${runtimeVersion}; Standard parity, Desktop-only Web context suppression, and user-invocable Office skills`);
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
