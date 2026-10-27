import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const manifest = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))

test('distributed plugin requirements match the runtime used to build and test them', async () => {
  const workspace = await manifest('../package.json')
  const installedHost = await manifest('../node_modules/@deepseek-ai/dsh/package.json')
  const version = workspace.devDependencies['@deepseek-ai/dsh']
  assert.equal(installedHost.version, version)
  assert.equal(workspace.devDependencies['@deepseek-ai/dsh-typert-generator'], version)
  for (const path of ['../packages/learny/package.json', '../packages/web-search-oneapi/package.json']) {
    const plugin = await manifest(path)
    assert.equal(plugin.dsh.engines.dsh, version, plugin.name)
    for (const section of ['peerDependencies', 'dependencies', 'devDependencies']) {
      for (const [name, requirement] of Object.entries(plugin[section] ?? {})) {
        if (name.startsWith('@deepseek-ai/dsh-')) assert.equal(requirement, version, `${plugin.name}: ${name}`)
      }
    }
    if (plugin.dshWorkshop) assert.deepEqual(plugin.dshWorkshop.compatibility.dshVersions, [version])
  }
})
