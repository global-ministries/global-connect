/**
 * /dps (the root of the "DPS" menu section, odd/tasks/dps-asistencia-pco.md,
 * T9, L29): opens the Sunday attendance; that page decides who may see it.
 */
jest.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`NEXT_REDIRECT:${to}`) } }))

import DpsPage from '@/app/(auth)/dps/page'

describe('/dps', () => {
  it('redirects to the attendance', () => {
    expect(() => DpsPage()).toThrow('NEXT_REDIRECT:/dps/asistencia')
  })
})
