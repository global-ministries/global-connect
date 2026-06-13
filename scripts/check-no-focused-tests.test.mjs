import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { runFocusedTestsGuard } from './check-no-focused-tests.mjs'

async function withTempDir(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'check-no-focused-tests-'))
  try {
    return await fn(dir)
  } finally {
    await fs.rm(dir, { force: true, recursive: true })
  }
}

describe('runFocusedTestsGuard', () => {
  it('detects focused Jest tests even with spaced dot', async () => {
    await withTempDir(async (dir) => {
      const testDir = path.join(dir, '__tests__')
      await fs.mkdir(testDir)
      await fs.writeFile(path.join(testDir, 'sample.test.ts'), "it . only('focused', () => {})\n")

      const findings = runFocusedTestsGuard({ rootDir: dir })

      assert.equal(findings.length, 1)
      assert.equal(findings[0].line, 1)
      assert.match(findings[0].lineText, /it \. only\('/)
      assert.equal(findings[0].matcher.includes('it'), true)
    })
  })

  it('ignores focused tests inside excluded directories', async () => {
    await withTempDir(async (dir) => {
      const badNodeModules = path.join(dir, 'node_modules')
      const badArtifacts = path.join(dir, 'artifacts')
      const goodDir = path.join(dir, '__tests__')

      await fs.mkdir(path.join(badNodeModules, '__tests__'), { recursive: true })
      await fs.mkdir(path.join(badArtifacts, '__tests__'), { recursive: true })
      await fs.mkdir(goodDir)

      await fs.writeFile(path.join(badNodeModules, '__tests__', 'skip.test.ts'), "it.only('blocked', () => {})\n")
      await fs.writeFile(path.join(badArtifacts, '__tests__', 'skip.test.ts'), "describe.only('blocked', () => {})\n")
      await fs.writeFile(path.join(goodDir, 'passes.test.ts'), "test('passes', () => {})\n")

      const findings = runFocusedTestsGuard({ rootDir: dir })

      assert.equal(findings.length, 0)
    })
  })

  it('accepts normal Jest test files with no focused definitions', async () => {
    await withTempDir(async (dir) => {
      const testDir = path.join(dir, '__tests__')
      await fs.mkdir(testDir)
      await fs.writeFile(path.join(testDir, 'passes.test.ts'), "test('passes', () => {})\n")

      const findings = runFocusedTestsGuard({ rootDir: dir })

      assert.equal(findings.length, 0)
    })
  })
})
