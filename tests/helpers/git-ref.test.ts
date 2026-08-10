import { execSync } from 'node:child_process'
import { resolveMainRef } from './git-ref'

describe('resolveMainRef', () => {
  it('returns a non-empty string', () => {
    const ref = resolveMainRef()
    expect(typeof ref).toBe('string')
    expect(ref.length).toBeGreaterThan(0)
  })

  it('returns a ref that resolves via git rev-parse', () => {
    const ref = resolveMainRef()
    let resolved: string
    try {
      resolved = execSync(`git rev-parse --verify --quiet ${ref}`, {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim()
    } catch {
      throw new Error(`resolveMainRef returned '${ref}' which git cannot resolve`)
    }
    expect(resolved).toMatch(/^[0-9a-f]{40}$/)
  })

  it('returned ref is one of: full SHA, main, or origin/main', () => {
    // The helper returns either a 40-char SHA (from GITHUB_EVENT_PATH)
    // or a symbolic ref name. All three are valid for `git diff <ref>..HEAD`.
    const ref = resolveMainRef()
    const isSha = /^[0-9a-f]{40}$/.test(ref)
    const isSymbolic = ref === 'main' || ref === 'origin/main'
    expect(isSha || isSymbolic).toBe(true)
  })
})