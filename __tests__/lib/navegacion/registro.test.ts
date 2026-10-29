import {
  ENTRADAS_NAVEGACION,
  entradasDeSecciones,
  esEntradaActiva,
  esRutaActiva,
  filtrarVisibles,
} from '@/lib/navegacion/registro'

const todas = ENTRADAS_NAVEGACION.flatMap((entrada) => [entrada, ...(entrada.children ?? [])])

describe('navigation registry', () => {
  it('gives every entry a unique id', () => {
    const ids = todas.map((entrada) => entrada.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('never shows two links with the same name to the most privileged user', () => {
    const visibles = filtrarVisibles(ENTRADAS_NAVEGACION, {
      roles: ['admin'],
      supportCapabilities: ['support.view', 'support.reply', 'support.manage'],
    }).flatMap((entrada) => [entrada, ...(entrada.children ?? [])])
    // "Configuración" is both the section and the Grupos de Vida setting; each sits under its own parent.
    const nombres = visibles.map((entrada) => entrada.label).filter((label) => label !== 'Configuración')
    expect(new Set(nombres).size).toBe(nombres.length)
    expect(nombres).toEqual(expect.arrayContaining(['Cola de soporte', 'Configuración de soporte']))
    expect(nombres).not.toContain('Soporte')
  })

  // The bottom bar's priority list (entradasBarraInferior) gave way to the tab
  // rule in lib/navegacion/secciones.ts (__tests__/lib/navegacion/secciones.test.ts).
  it('lists the entries of the requested sections in registry order', () => {
    expect(entradasDeSecciones('pie', 'cuenta').map((e) => e.href)).toEqual(['/actualizaciones', '/ayuda', '/perfil'])
    expect(entradasDeSecciones('general', 'ministerios', 'dream-team', 'administracion').map((e) => e.href)).toEqual([
      '/dashboard', '/users', '/grupos-vida', '/configuracion', '/ayuda/admin',
    ])
  })

  it('drops the children a role cannot see', () => {
    const [gruposVida] = filtrarVisibles(
      ENTRADAS_NAVEGACION.filter((entrada) => entrada.id === 'grupos-vida'),
      { roles: ['director-etapa'], supportCapabilities: [] },
    )
    expect(gruposVida.children?.map((hija) => hija.id)).not.toEqual(expect.arrayContaining(['gv-directores']))
    expect(gruposVida.children?.map((hija) => hija.id)).toContain('gv-mapa')
  })

  it('matches a route and the routes below it, but /dashboard only itself', () => {
    expect(esRutaActiva('/users/123', '/users')).toBe(true)
    expect(esRutaActiva('/usersx', '/users')).toBe(false)
    expect(esRutaActiva('/dashboard/otro', '/dashboard')).toBe(false)
    expect(esRutaActiva(null, '/users')).toBe(false)
  })

  it('marks a parent active on any child route', () => {
    const gruposVida = ENTRADAS_NAVEGACION.find((entrada) => entrada.id === 'grupos-vida')!
    expect(esEntradaActiva('/grupos-vida/mapa', gruposVida)).toBe(true)
    expect(esEntradaActiva('/actualizaciones', gruposVida)).toBe(false)
  })
})
