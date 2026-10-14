import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator'

const root = fileURLToPath(new URL('..', import.meta.url))
const plugin = join(root, 'packages/learny')
const oneApiSearch = join(root, 'packages/web-search-oneapi')
const require = createRequire(import.meta.url)
const compile = config => execFileSync(process.execPath, [require.resolve('typescript/lib/tsc.js'), '-p', config], { cwd: root, stdio: 'inherit' })

compile('packages/web-search-oneapi/tsconfig.json')
compile('packages/learny/tsconfig.host.json')
const artifacts = new WorkspaceTypertGenerator(root).generate(['dsh-plugin-learny'], ['host'])
if (artifacts.length !== 1 || !artifacts[0].remote) throw new Error('Expected exactly one generated Host and Remote contribution')
await mkdir(join(plugin, 'lib'), { recursive: true })
for (const artifact of artifacts) {
  await writeFile(join(plugin, 'lib/typert.host.js'), artifact.js)
  await writeFile(join(plugin, 'lib/typert.host.d.ts'), artifact.dts)
  await writeFile(join(plugin, 'lib/typert.remote-client.js'), artifact.remote.js)
  await writeFile(join(plugin, 'lib/typert.remote-client.d.ts'), artifact.remote.dts)
  await writeFile(join(plugin, 'lib/typert.remote-client.d.ts.map'), artifact.remote.dtsMap)
}
compile('packages/learny/tsconfig.client.json')
await build({
  entryPoints: [join(plugin, 'lib/types/index.js')], outfile: join(plugin, 'lib/index.js'),
  bundle: true, packages: 'external', platform: 'node', format: 'esm', sourcemap: true,
})
const client = await build({
  entryPoints: [join(plugin, 'src/client/index.tsx')], bundle: true, platform: 'browser', format: 'cjs', write: false,
  jsx: 'automatic',
  external: ['react', 'react/jsx-runtime', 'react-dom', '@deepseek-ai/cordis'],
  define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.css': 'text' },
})
await writeFile(join(plugin, 'lib/client.js'),
  'window.__ModuleLoader__.load({id:"dsh-plugin-learny",factory:(require)=>{var module={exports:{}};var exports=module.exports;\n'
  + client.outputFiles[0].text + '\nreturn module.exports;}});\n')
await mkdir(join(oneApiSearch, 'lib'), { recursive: true })
await build({
  entryPoints: [join(oneApiSearch, 'lib/types/index.js')],
  outfile: join(oneApiSearch, 'lib/index.js'),
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  sourcemap: true,
})
console.log('Built Host, generated Typert/Remote and browser client for dsh-plugin-learny')
console.log('Built dsh-web-search-oneapi')
