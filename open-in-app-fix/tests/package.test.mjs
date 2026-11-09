import assert from 'node:assert/strict'
import { readFile, access } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const text = path => readFile(new URL(path, root), 'utf8')
const json = async path => JSON.parse(await text(path))

test('independent dependency-free Host bundle with a single unique row', async () => {
  const pkg = await json('package.json')
  assert.equal(pkg.name, '@local/dsh-open-in-app-fix')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.exports['.'], './index.js')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client, undefined)
  assert.equal(pkg.dependencies, undefined)
  assert.equal(pkg.peerDependencies, undefined)
  assert.deepEqual(Object.keys(pkg.scripts), ['test'])
  assert.equal(pkg.engines.dsh, '>=0.2.1-rc.5 <0.3.0')
  const patch = await text('cordis.patch.yml')
  assert.equal(patch, "- insert:\n    - id: open-in-app-fix\n      name: '@local/dsh-open-in-app-fix'\n")
})

test('both locales and original SVG icon are exported and nonempty', async () => {
  const pkg = await json('package.json')
  assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
  assert.equal(pkg.exports['./icon'], './icon.svg')
  for (const language of ['en', 'zh']) {
    const locale = await json(`locale/${language}.json`)
    assert(locale.meta.title.trim().length > 4)
    assert(locale.meta.description.trim().length > 20)
  }
  const icon = await text('icon.svg')
  assert.match(icon, /xmlns="http:\/\/www.w3.org\/2000\/svg"/)
  assert.match(icon, /viewBox="0 0 64 64"/)
  assert(!/<script|<foreignObject|\bonload\s*=|(?:href|src)\s*=/i.test(icon))
  assert(Buffer.byteLength(icon) < 256 * 1024)
})

test('distribution manifest includes every runtime module and display resource', async () => {
  const pkg = await json('package.json')
  for (const path of ['index.js', 'spawn-guard.js', 'cordis.patch.yml', 'README.md', 'icon.svg']) {
    assert(pkg.files.includes(path), path)
    await access(new URL(path, root))
  }
  assert(pkg.files.includes('locale/*.json'))
  const source = (await text('index.js')) + (await text('spawn-guard.js'))
  assert(!source.includes('app.asar'))
  assert(!source.includes('process.env ='))
  assert(!source.includes('delete process.env'))
})
