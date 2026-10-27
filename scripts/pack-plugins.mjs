import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
mkdirSync(join(root, 'artifacts'), { recursive: true })
for (const directory of ['learny', 'web-search-oneapi']) {
  const cwd = join(root, 'packages', directory)
  const { name, version } = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'))
  execFileSync('pnpm', ['pack', '--out', join(root, 'artifacts', `${name}-${version}.tgz`)], { cwd, stdio: 'inherit' })
}
