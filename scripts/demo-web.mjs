import { spawnSync, spawn } from 'node:child_process'
import { mkdirSync, existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const cli = join(root, 'node_modules/.bin/dsh')
function readDotEnv(path) {
  if (!existsSync(path)) return {}
  const values = {}
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted)
    values[match[1]] = value
  }
  return values
}
const env = { ...readDotEnv(join(root, '.env')), ...process.env,
  DSH_HOME: process.env.DSH_HOME ?? join(root, 'artifacts/dsh-home'),
  LEARNY_DATA_DIR: process.env.LEARNY_DATA_DIR ?? join(root, 'artifacts/learny-data'),
}
const profile = process.env.LEARNY_PROFILE ?? 'learny-smoke'
mkdirSync(join(root, 'artifacts'), { recursive: true })
if (process.argv[2] === 'install') {
  for (const args of [
    ...existsSync(join(env.DSH_HOME, 'profiles', profile, 'package.json')) ? [] : [['--profile', profile, '--from-default-profile', 'web', '--dump-config']],
    ['plugin', '--profile', profile, 'add', join(root, 'artifacts/dsh-plugin-learny-0.1.4.tgz')],
    ['plugin', '--profile', profile, 'add', join(root, 'artifacts/dsh-web-search-oneapi-0.1.2.tgz')],
  ]) {
    const result = spawnSync(cli, args, { cwd: root, env, stdio: args.includes('--dump-config') ? ['inherit', 'ignore', 'inherit'] : 'inherit' })
    if (result.error) throw result.error
    if (result.status !== 0) process.exit(result.status ?? 1)
  }
} else {
  const patchFile = process.env.DSH_PATCH_FILE
  const args = ['--profile', profile, ...(patchFile ? ['--patch', patchFile] : []), '--no-open', '--host', '127.0.0.1', '--port', process.env.LEARNY_PORT ?? '3097']
  const child = spawn(cli, args, { cwd: root, env, stdio: 'inherit' })
  child.on('error', error => { console.error(error.message); process.exitCode = 1 })
  child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0) })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
}
