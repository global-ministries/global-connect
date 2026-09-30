/**
 * Grupos de Vida — server loader of /grupos-vida/directores.
 *
 * Reads the rows with the admin client (RLS would hide most of them from a
 * director general) but only AFTER checking the caller's role: admin, pastor or
 * director-general; anyone else gets `null`. Server-side only — the admin client
 * refuses to run in a browser.
 *
 * - Admin and pastor get every general director and every stage director, the
 *   "Por ordenar" strip, and can edit.
 * - A director general gets only their own card, read-only, and only the stage
 *   directors of the segments they hold; no strip.
 *
 * Every read is checked: a failed read throws instead of showing partial
 * numbers. Tables that grow (groups, links, leaders, scopes, marks, roles) are read in pages so the
 * API row cap never truncates a count silently.
 */
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { leer, leerPaginado, leerPorIds } from '@/lib/platform/grupos-vida/lectura-supabase'
import {
  construirVistaDirectores,
  type EntradaVistaDirectores,
  type VistaDirectores,
} from '@/lib/platform/grupos-vida/directores-vista'

const ROLES_QUE_ENTRAN = ['admin', 'pastor', 'director-general']
const ROLES_QUE_ADMINISTRAN = ['admin', 'pastor']
export interface ParametrosCarga {
  readonly authId: string
  readonly roles: readonly string[]
}

const nombreCompleto = (nombre: string, apellido: string | null): string => `${nombre} ${apellido ?? ''}`.trim()

export async function cargarVistaDirectores({ authId, roles }: ParametrosCarga): Promise<VistaDirectores | null> {
  if (!roles.some((rol) => ROLES_QUE_ENTRAN.includes(rol))) return null
  const soloLectura = !roles.some((rol) => ROLES_QUE_ADMINISTRAN.includes(rol))

  const adminDb = createSupabaseAdminClient()

  const [rolesSistema, segmentos, grupos, lideres, enlaces, alcances, marcas] = await Promise.all([
    leer('roles_sistema', adminDb.from('roles_sistema').select('id, nombre_interno')),
    leer('segmentos', adminDb.from('segmentos').select('id, nombre')),
    leerPaginado('grupos', (desde, hasta) =>
      adminDb
        .from('grupos')
        .select('id, segmento_id, activo, eliminado, estado_aprobacion')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('segmento_lideres', (desde, hasta) =>
      adminDb
        .from('segmento_lideres')
        .select('id, usuario_id, segmento_id, tipo_lider')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('director_etapa_grupos', (desde, hasta) =>
      adminDb
        .from('director_etapa_grupos')
        .select('director_etapa_id, grupo_id')
        .order('id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('director_general_segmentos', (desde, hasta) =>
      adminDb
        .from('director_general_segmentos')
        .select('usuario_id, segmento_id, alcance')
        .order('usuario_id', { ascending: true })
        .order('segmento_id', { ascending: true })
        .range(desde, hasta),
    ),
    leerPaginado('dg_directores_etapa', (desde, hasta) =>
      adminDb
        .from('dg_directores_etapa')
        .select('dg_usuario_id, segmento_lider_id')
        .order('dg_usuario_id', { ascending: true })
        .order('segmento_lider_id', { ascending: true })
        .range(desde, hasta),
    ),
  ])

  const nombreDeRol = new Map(rolesSistema.map((r) => [r.id, r.nombre_interno]))
  const idsDeRoles = rolesSistema
    .filter((r) => ['director-general', 'admin', 'pastor', 'director-etapa'].includes(r.nombre_interno))
    .map((r) => r.id)
  const rolesDePersonas = idsDeRoles.length
    ? await leerPaginado('usuario_roles', (desde, hasta) =>
        adminDb
          .from('usuario_roles')
          .select('usuario_id, rol_id')
          .in('rol_id', idsDeRoles)
          .order('usuario_id', { ascending: true })
          .order('rol_id', { ascending: true })
          .range(desde, hasta),
      )
    : []

  const rolesPorPersona = new Map<string, string[]>()
  for (const fila of rolesDePersonas) {
    const interno = nombreDeRol.get(fila.rol_id)
    if (!interno) continue
    rolesPorPersona.set(fila.usuario_id, [...(rolesPorPersona.get(fila.usuario_id) ?? []), interno])
  }
  const conRol = (rol: string): string[] => [...rolesPorPersona.entries()].filter(([, r]) => r.includes(rol)).map(([id]) => id)

  const directoresDeEtapa = lideres.filter((l) => l.tipo_lider === 'director_etapa')
  const idsDePersonas = [
    ...new Set([
      ...conRol('director-general'),
      ...conRol('director-etapa'),
      ...directoresDeEtapa.map((l) => l.usuario_id),
    ]),
  ]
  const personas = await leerPorIds('usuarios', idsDePersonas, (lote) =>
    adminDb.from('usuarios').select('id, nombre, apellido, auth_id, direccion_id').in('id', lote),
  )
  const personaPorId = new Map(personas.map((p) => [p.id, p]))

  // City of a stage director: usuario -> direccion -> parroquia -> municipio.
  const idsDirecciones = [...new Set(directoresDeEtapa.map((l) => personaPorId.get(l.usuario_id)?.direccion_id).filter((id): id is string => !!id))]
  const direcciones = await leerPorIds('direcciones', idsDirecciones, (lote) =>
    adminDb.from('direcciones').select('id, parroquia_id').in('id', lote),
  )
  const idsParroquias = [...new Set(direcciones.map((d) => d.parroquia_id).filter((id): id is string => !!id))]
  const parroquias = await leerPorIds('parroquias', idsParroquias, (lote) =>
    adminDb.from('parroquias').select('id, municipio_id').in('id', lote),
  )
  const idsMunicipios = [...new Set(parroquias.map((p) => p.municipio_id).filter((id): id is string => !!id))]
  const municipios = await leerPorIds('municipios', idsMunicipios, (lote) =>
    adminDb.from('municipios').select('id, nombre').in('id', lote),
  )
  const parroquiaDeDireccion = new Map(direcciones.map((d) => [d.id, d.parroquia_id]))
  const municipioDeParroquia = new Map(parroquias.map((p) => [p.id, p.municipio_id]))
  const nombreDeMunicipio = new Map(municipios.map((m) => [m.id, m.nombre]))
  const ciudadDe = (direccionId: string | null | undefined): string | null => {
    const parroquia = direccionId ? parroquiaDeDireccion.get(direccionId) : null
    const municipio = parroquia ? municipioDeParroquia.get(parroquia) : null
    return (municipio ? nombreDeMunicipio.get(municipio) : null) ?? null
  }

  const propio = soloLectura ? personas.find((p) => p.auth_id === authId) : undefined
  const generalesTodos = conRol('director-general').flatMap((id) => {
    const persona = personaPorId.get(id)
    return persona
      ? [{ usuarioId: id, nombre: nombreCompleto(persona.nombre, persona.apellido), roles: rolesPorPersona.get(id) ?? [] }]
      : []
  })

  const entrada: EntradaVistaDirectores = {
    segmentos,
    grupos: grupos.map((g) => ({
      id: g.id,
      segmentoId: g.segmento_id,
      activo: g.activo === true,
      eliminado: g.eliminado,
      estadoAprobacion: g.estado_aprobacion,
    })),
    directoresEtapa: directoresDeEtapa.map((l) => {
      const persona = personaPorId.get(l.usuario_id)
      return {
        id: l.id,
        usuarioId: l.usuario_id,
        segmentoId: l.segmento_id,
        nombre: persona ? nombreCompleto(persona.nombre, persona.apellido) : 'Persona sin nombre',
        ciudad: ciudadDe(persona?.direccion_id),
        tieneCuenta: !!persona?.auth_id,
      }
    }),
    enlaces: enlaces.map((e) => ({ directorId: e.director_etapa_id, grupoId: e.grupo_id })),
    generales: soloLectura ? generalesTodos.filter((g) => g.usuarioId === propio?.id) : generalesTodos,
    alcances: alcances
      .filter((a) => !soloLectura || a.usuario_id === propio?.id)
      .map((a) => ({ usuarioId: a.usuario_id, segmentoId: a.segmento_id, alcance: a.alcance })),
    marcas: marcas
      .filter((m) => !soloLectura || m.dg_usuario_id === propio?.id)
      .map((m) => ({ usuarioId: m.dg_usuario_id, directorId: m.segmento_lider_id })),
    personasConRolDirectorEtapa: conRol('director-etapa').flatMap((id) => {
      const persona = personaPorId.get(id)
      return persona ? [{ id, nombre: nombreCompleto(persona.nombre, persona.apellido) }] : []
    }),
    usuariosConSegmentoLider: lideres.map((l) => l.usuario_id),
    soloLectura,
  }

  const vista = construirVistaDirectores(entrada)
  if (!soloLectura) return vista

  // A director general sees the stage directors of the segments they hold.
  const propios = new Set(entrada.alcances.map((a) => a.segmentoId))
  const etapa = vista.etapa.filter((f) => propios.has(f.segmentoId))
  return {
    ...vista,
    etapa,
    segmentos: vista.segmentos.filter((s) => propios.has(s.id)),
    totales: { generales: vista.generales.length, etapa: etapa.length },
  }
}
