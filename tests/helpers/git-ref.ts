import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * Resolve the merge-base ref to use for byte-identity guard tests.
 *
 * Returns a 40-character SHA, local branch name, or `origin/main`
 * that the caller can use as `<ref>..HEAD` in a `git diff` invocation
 * (two dots, direct comparison — does NOT require full git history).
 *
 * Resolution order:
 *   1. Read the exact PR base SHA from `$GITHUB_EVENT_PATH` (most
 *      reliable — the exact commit the PR was opened against). If
 *      the SHA is not already in the local object store (shallow
 *      clones with `fetch-depth: 1`), `git fetch --depth=1 origin <sha>`
 *      pulls just that single commit without trying to walk history.
 *   2. Local `refs/heads/main` (developer ergonomics).
 *   3. Remote-tracking `refs/remotes/origin/main`.
 *   4. `git fetch --depth=1 origin main` + use `origin/main`.
 *
 * Always pair this with `..` (two dots), never `...` (three dots),
 * so the diff works on shallow checkouts.
 */
export function resolveMainRef(): string {
  const baseSha = readBaseShaFromEvent()
  if (baseSha && ensureRefAvailable(baseSha)) return baseSha

  if (refExists('refs/heads/main')) return 'main'
  if (refExists('refs/remotes/origin/main')) return 'origin/main'

  try {
    execSync('git fetch --depth=1 --no-tags origin main', {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch {
    throw new Error(
      'resolveMainRef: failed to resolve the main ref. Tried ' +
        'GITHUB_EVENT_PATH, refs/heads/main, refs/remotes/origin/main, ' +
        'and `git fetch --depth=1 origin main`. None are reachable.',
    )
  }
  if (refExists('refs/remotes/origin/main')) return 'origin/main'
  throw new Error(
    'resolveMainRef: `git fetch origin main` succeeded but the ref ' +
      'is still not resolvable. Check the upstream remote name and ' +
      'branch visibility for this repository.',
  )
}

function ensureRefAvailable(ref: string): boolean {
  if (refExists(ref)) return true
  // CI shallow clones may not have the base commit in the local object
  // store. Fetch just that single commit (depth=1 avoids walking history,
  // which can hang for minutes on shallow clones).
  try {
    execSync(`git fetch --depth=1 --no-tags origin ${ref}`, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
  } catch {
    return false
  }
  return refExists(ref)
}

function refExists(ref: string): boolean {
  try {
    execSync(`git rev-parse --verify --quiet ${ref}`, { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function readBaseShaFromEvent(): string | undefined {
  const path = process.env.GITHUB_EVENT_PATH
  if (!path) return undefined
  try {
    const event = JSON.parse(readFileSync(path, 'utf-8'))
    const base = event?.pull_request?.base?.sha
    if (typeof base === 'string' && /^[0-9a-f]{40}$/.test(base)) {
      return base
    }
  } catch {
    // fall through
  }
  return undefined
}