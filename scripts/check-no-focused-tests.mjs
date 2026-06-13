import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const FOCUSED_TEST_REGEX = /(?:^|[^A-Za-z0-9_$])(it|test|describe)\s*\.\s*only\s*\(/g
const DEFAULT_IGNORE_DIRS = new Set(['.git', '.next', 'artifacts', 'coverage', 'node_modules', '.turbo', 'tmp'])
const TEST_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'])

function isTestFile(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  if (!TEST_EXTENSIONS.has(ext)) {
    return false
  }

  const segments = filePath.split(path.sep)
  const base = path.basename(filePath)
  const isTestSuffix = /(\.test|\.spec)\./i.test(base)
  const isUnderTestsFolder = segments.includes('__tests__')

  return isTestSuffix || isUnderTestsFolder
}

function collectTestFiles(currentDir, ignoreDirs, files) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (ignoreDirs.has(entry.name)) {
        continue
      }

      collectTestFiles(path.join(currentDir, entry.name), ignoreDirs, files)
      continue
    }

    const absolutePath = path.join(currentDir, entry.name)
    if (isTestFile(absolutePath)) {
      files.push(absolutePath)
    }
  }

  return files
}

function sanitizeLine(line, scanState) {
  let sanitized = ''
  let i = 0
  let insideBlockComment = scanState.inBlockComment
  let inString = scanState.inString
  let isEscaping = scanState.isEscaping

  while (i < line.length) {
    const current = line[i]
    const next = line[i + 1]

    if (insideBlockComment) {
      if (current === '*' && next === '/') {
        insideBlockComment = false
        i += 2
        continue
      }

      i += 1
      continue
    }

    if (inString !== null) {
      if (isEscaping) {
        isEscaping = false
        i += 1
        continue
      }

      if (current === '\\') {
        isEscaping = true
        i += 1
        continue
      }

      if (current === inString) {
        inString = null
        i += 1
        continue
      }

      i += 1
      continue
    }

    if (current === '/' && next === '*') {
      insideBlockComment = true
      i += 2
      continue
    }

    if (current === '/' && next === '/') {
      break
    }

    if ((current === '\'' || current === '"' || current === '`')) {
      inString = current
      i += 1
      continue
    }

    sanitized += current
    i += 1
  }

  return {
    sanitized,
    inBlockComment: insideBlockComment,
    inString,
    isEscaping,
  }
}

function scanForFocusedTests(filePath) {
  const violations = []
  const fileText = fs.readFileSync(filePath, 'utf8')
  const lines = fileText.split(/\r?\n/)
  const scanState = {
    inBlockComment: false,
    inString: null,
    isEscaping: false,
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const {
      sanitized,
      inBlockComment,
      inString,
      isEscaping,
    } = sanitizeLine(line, scanState)

    scanState.inBlockComment = inBlockComment
    scanState.inString = inString
    scanState.isEscaping = isEscaping

    const match = sanitized.match(FOCUSED_TEST_REGEX)
    if (match === null) {
      continue
    }

    violations.push({
      file: filePath,
      line: index + 1,
      lineText: line.trim(),
      matcher: match[0],
    })
  }

  return violations
}

export function runFocusedTestsGuard(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd())
  const ignoreDirs = new Set(DEFAULT_IGNORE_DIRS)

  if (options.ignoreDirs) {
    for (const dir of options.ignoreDirs) {
      ignoreDirs.add(dir)
    }
  }

  const testFiles = collectTestFiles(rootDir, ignoreDirs, [])
  const violations = []

  for (const testFile of testFiles) {
    violations.push(...scanForFocusedTests(testFile))
  }

  return violations
}

function formatFindings(violations, rootDir) {
  const lines = ['Focused Jest tests detected:', '']

  for (const violation of violations) {
    lines.push(`- ${path.relative(rootDir, violation.file)}:${violation.line}`)
    lines.push(`  ${violation.lineText}`)
  }

  return lines.join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = runFocusedTestsGuard()

  const rootDir = process.cwd()

  if (violations.length === 0) {
    console.log('No focused Jest tests found.')
    process.exit(0)
  }

  console.error(formatFindings(violations, rootDir))
  process.exit(1)
}
