import assert from 'node:assert/strict';
import test from 'node:test';

import {
  gitUrl,
  normalizeManifest,
  renderIndex,
  renderInstall,
  renderReadme,
  renderSpecs,
  renderTable,
  replaceBlock,
  resolveTag,
  specOf,
  specsOf
} from './plugins.mjs';

const COMMIT = 'a'.repeat(40);
const ROOT = process.platform === 'win32' ? 'C:\\repo' : '/repo';

const raw = () => ({
  profile: 'desktop',
  repository: 'https://github.com/wooly99/dsh-plugins',
  commit: COMMIT,
  engines: { dsh: '>=0.2.1-rc.5 <0.3.0' },
  market: {
    title: { en: 'Title', zh: '标题' },
    description: { en: 'Description' },
    categories: { ui: { title: { en: 'UI' } }, tools: { title: { en: 'Tools' } } }
  },
  plugins: [
    { source: 'repo', dir: 'one', category: 'ui', title: { en: 'One', zh: '一号' }, summary: { en: 'first', zh: '第一个' }, keywords: ['k'] },
    {
      source: 'npm',
      package: 'pkg',
      version: '1.2.3',
      publishTimestamp: 42,
      homepage: 'https://example.com/pkg',
      category: 'tools',
      title: { en: 'Pkg' },
      summary: { en: 'package' }
    }
  ]
});

const readPackage = (dir) => {
  if (dir !== 'one') throw new Error(`ENOENT ${dir}`);
  return { name: '@local/one', version: '0.1.0', dsh: { bundle: { patch: './cordis.patch.yml' } } };
};

const context = (overrides = {}) => ({ mode: 'remote', commit: COMMIT, repository: raw().repository, root: ROOT, ...overrides });

const README = [
  '# Title',
  '<!-- plugins:table:start -->',
  'stale',
  '<!-- plugins:table:end -->',
  'prose',
  '<!-- plugins:specs:start -->',
  'stale',
  '<!-- plugins:specs:end -->',
  '<!-- plugins:install:start -->',
  'stale',
  '<!-- plugins:install:end -->',
  'tail'
].join('\n');

test('repo entries take their identity from the plugin package.json', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  assert.deepEqual(manifest.plugins.map((plugin) => [plugin.name, plugin.version]), [
    ['@local/one', '0.1.0'],
    ['pkg', '1.2.3']
  ]);
  assert.equal(manifest.plugins[0].icon, 'icon.svg');
});

test('a repo entry without dsh.bundle.patch is refused', () => {
  const manifest = raw();
  manifest.plugins[0].dir = 'two';
  assert.throws(() => normalizeManifest(manifest, (dir) => ({ name: dir, version: '1.0.0' })), /dsh\.bundle\.patch/);
});

test('an undeclared category is refused', () => {
  const manifest = raw();
  manifest.plugins[0].category = 'nope';
  assert.throws(() => normalizeManifest(manifest, readPackage), /category/);
});

test('an npm entry needs an exact version and a publish time', () => {
  const version = raw();
  version.plugins[1].version = 'latest';
  assert.throws(() => normalizeManifest(version, readPackage), /确切 version/);
  const time = raw();
  delete time.plugins[1].publishTimestamp;
  assert.throws(() => normalizeManifest(time, readPackage), /publishTimestamp/);
});

test('a tagged npm entry without a resolved version points at --refresh', () => {
  const manifest = raw();
  manifest.plugins[1].tag = 'latest';
  delete manifest.plugins[1].version;
  assert.throws(() => normalizeManifest(manifest, readPackage), /index --refresh/);
});

test('resolveTag turns a dist-tag into an exact version and a unix time', async () => {
  const document = {
    'dist-tags': { latest: '9.8.7' },
    time: { '9.8.7': '2026-10-31T15:19:50.000Z' }
  };
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url);
    return { ok: true, json: async () => document };
  };
  assert.deepEqual(await resolveTag('@scope/pkg', 'latest', { fetchImpl }), { version: '9.8.7', publishTimestamp: 1793459990 });
  assert.deepEqual(seen, ['https://registry.npmjs.org/%40scope%2Fpkg']);

  const noTag = async () => ({ ok: true, json: async () => ({ 'dist-tags': {}, time: {} }) });
  await assert.rejects(resolveTag('pkg', 'latest', { fetchImpl: noTag }), /没有 dist-tag latest/);
  const badHttp = async () => ({ ok: false, status: 404 });
  await assert.rejects(resolveTag('pkg', 'latest', { fetchImpl: badHttp }), /HTTP 404/);
});

test('remote repo specs pin commit and subdirectory', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  assert.deepEqual(specsOf(manifest, context()), [
    `git+https://github.com/wooly99/dsh-plugins.git#${COMMIT}&path:/one`,
    'pkg@1.2.3'
  ]);
  assert.equal(gitUrl('https://x/y.git'), 'https://x/y.git');
  assert.equal(gitUrl('https://x/y'), 'https://x/y.git');
});

test('local specs are forward-slash link: paths', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  const spec = specOf(manifest.plugins[0], context({ mode: 'local' }));
  assert.ok(spec.startsWith('link:'), spec);
  assert.ok(spec.endsWith('/one'), spec);
  assert.ok(!spec.includes('\\'), spec);
  assert.ok(spec.includes(ROOT.replaceAll('\\', '/')), spec);
});

test('the market index documents both sources and only repo engines', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  const index = renderIndex(manifest, { commit: COMMIT, times: { one: 1793561173 } });
  assert.equal(index.format, 1);
  assert.deepEqual(index.plugins[0].versions[0], {
    version: '0.1.0',
    publishTimestamp: 1793561173,
    source: { type: 'git', url: 'https://github.com/wooly99/dsh-plugins.git', commit: COMMIT, path: 'one' },
    engines: { dsh: '>=0.2.1-rc.5 <0.3.0' }
  });
  assert.deepEqual(index.plugins[1].versions[0], {
    version: '1.2.3',
    publishTimestamp: 42,
    source: { type: 'npm' }
  });
  assert.equal(index.plugins[0].icon, './icons/one.svg');
  assert.equal(index.plugins[1].icon, undefined);
  assert.equal(index.plugins[0].name, '@local/one');
});

test('the table and specs use the Chinese labels when present', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  const table = renderTable(manifest);
  assert.match(table, /\| 插件 \| 功能 \| 版本 \| 来源 \|/);
  assert.match(table, /\[一号\]\(one\/README\.md\) \| 第一个 \| 0\.1\.0 \| 本仓库 \|/);
  assert.match(table, /\[Pkg\]\(https:\/\/example\.com\/pkg\) \| package \| 1\.2\.3 \| npm \|/);

  const specs = renderSpecs(manifest, context());
  assert.match(specs, /^- 一号：`git\+.*&path:\/one`$/m);
  assert.match(specs, /^- Pkg：`pkg@1\.2\.3`$/m);
});

test('the install command quotes every spec so & survives a shell', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  const block = renderInstall(manifest, context());
  const command = block.split('\n')[1];
  assert.ok(command.startsWith('dsh plugin --profile desktop add --ignore-scripts '), command);
  assert.ok(command.includes(`"git+https://github.com/wooly99/dsh-plugins.git#${COMMIT}&path:/one"`), command);
  assert.ok(command.includes('"pkg@1.2.3"'), command);
});

test('replaceBlock keeps everything outside the markers', () => {
  const once = replaceBlock(README, 'plugins:table', '| a |');
  assert.ok(once.startsWith('# Title\n<!-- plugins:table:start -->\n| a |\n<!-- plugins:table:end -->\nprose'));
  assert.equal(replaceBlock(once, 'plugins:table', '| a |'), once);
  assert.throws(() => replaceBlock('no markers', 'plugins:table', 'x'), /缺少/);
});

test('renderReadme fills all three blocks and is idempotent', () => {
  const manifest = normalizeManifest(raw(), readPackage);
  const once = renderReadme(README, manifest, context());
  assert.equal(renderReadme(once, manifest, context()), once);
  assert.ok(once.includes('[一号](one/README.md)'), once);
  assert.ok(once.endsWith('tail'), once);
});
