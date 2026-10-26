import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { projectSources } from '../packages/learny/lib/types/core/course-builder.js'
import { nodeTaskPrompt } from '../packages/learny/lib/types/core/lesson.js'

test('project evidence covers the overview and sibling modules beyond the first directory', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learny-project-sources-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const put = async (path, text) => { await mkdir(dirname(join(dir, path)), { recursive: true }); await writeFile(join(dir, path), text) }
  for (let n = 0; n < 35; n++) await put(`A-first/examples/example-${n}.ts`, 'export const example = true')
  await put('README_zh.md', '# 沙箱服务\nSDK → API → 调度 → 运行时')
  await put('docs/zh/architecture/overview.md', '# 架构\n控制面与数据面')
  await put('Scheduler/service/sandbox_create.go', 'package service\nfunc CreateSandbox() {}')
  await put('Worker/service/sandbox_resume.go', 'package service\nfunc ResumeSandbox() {}')
  await put('Runtime/src/main.rs', 'fn main() {}')
  await put('AGENTS.md', 'PRIVATE_AGENT_INSTRUCTIONS')
  await put('.env', 'SECRET_ENV')
  await put('credentials.json', '{"key":"SECRET_CREDENTIAL"}')
  await put('artifacts/session.ts', 'PRIVATE_SESSION')
  await put('vendor/main.go', 'VENDORED_SOURCE')
  await symlink(join(dir, '.env'), join(dir, 'external.ts'))
  const sources = await projectSources({ kind: 'project', materialPath: dir, name: 'Sandbox', goal: '学习 Scheduler、Worker 和 Runtime 的 sandbox 创建链路。' })
  const paths = sources.map(source => source.path)
  for (const expected of ['README_zh.md', 'docs/zh/architecture/overview.md', 'Scheduler/service/sandbox_create.go', 'Worker/service/sandbox_resume.go', 'Runtime/src/main.rs']) assert.ok(paths.includes(expected), expected)
  assert.ok(!sources.some(source => /PRIVATE_|SECRET_|VENDORED_/.test(source.excerpt)))
  assert.ok(!paths.includes('external.ts'))
  assert.equal(new Set(sources.map(source => source.id)).size, sources.length)
  assert.deepEqual((await projectSources({ kind: 'project', materialPath: dir, name: 'Sandbox', goal: '学习 Scheduler、Worker 和 Runtime 的 sandbox 创建链路。' })).map(source => source.path), paths)
})

test('native teaching receives learner constraints and source excerpts, not only links', () => {
  const prompt = nodeTaskPrompt('Sandbox', { title: '创建链路', keyPoints: [] },
    [{ id: 'project-1', title: 'service/create.go', url: 'file:///repo/service/create.go', text: 'func CreateSandbox() {}' }],
    { kind: 'project', materialPath: '/repo', goal: '我会 Go；macOS 上只读源码，不启动 KVM。' })
  assert.match(prompt, /我会 Go；macOS 上只读源码，不启动 KVM/)
  assert.match(prompt, /func CreateSandbox/)
  assert.match(prompt, /本地项目目录：\/repo/)
  assert.match(prompt, /仅在学习者要求时执行部署/)
})
