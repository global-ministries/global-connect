import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const pagePath = join(process.cwd(), 'app', '(auth)', 'users', '[id]', 'asistencia', 'page.tsx')

describe('attendance report page of one user', () => {
  it('does not write the auth id or the report to the server console', () => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).not.toMatch(/console\.(log|debug|info)\(/)
  })
})
