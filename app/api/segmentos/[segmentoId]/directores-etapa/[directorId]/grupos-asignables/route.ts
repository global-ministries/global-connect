import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getUserWithRoles } from '@/lib/getUserWithRoles'
import { normalizarNombre } from '@/lib/normalizarNombre'

// GET: lista grupos del segmento con flag asignado a director específico
export async function GET(req: Request, ctx: { params: Promise<{ segmentoId: string; directorId: string }> | { segmentoId: string; directorId: string } }) {
  try {
    const awaited = 'then' in ctx.params ? await ctx.params : ctx.params
    const { segmentoId, directorId } = awaited
    if (!segmentoId || !directorId) return NextResponse.json({ error: 'segmentoId y directorId requeridos' }, { status: 400 })
  const supabase = await createSupabaseServerClient()
  const supabaseAdmin = createSupabaseAdminClient()
  const userWithRoles = await getUserWithRoles(supabase)
    if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const roles = userWithRoles.roles || []
    const esSuperior = roles.some(r => ['admin','pastor','director-general'].includes(r))

    // Verificar director pertenece al segmento (podemos usar admin para evitar RLS si es superior)
    const { data: dirRow, error: dirErr } = await (esSuperior ? supabaseAdmin : supabase)
      .from('segmento_lideres')
      .select('id, segmento_id, tipo_lider')
      .eq('id', directorId)
      .maybeSingle()
    if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 400 })
    if (!dirRow) return NextResponse.json({ error: 'Director no encontrado' }, { status: 404 })
    if (dirRow.segmento_id !== segmentoId) return NextResponse.json({ error: 'Director no pertenece al segmento' }, { status: 403 })
    if (dirRow.tipo_lider !== 'director_etapa') return NextResponse.json({ error: 'No es director_etapa' }, { status: 400 })

    // Si no es superior y es el propio director: sólo ver grupos asignados
    let soloAsignados = false
    if (!esSuperior) soloAsignados = true

    // Obtener asignaciones del director
    const { data: asignaciones, error: asignErr } = await (esSuperior ? supabaseAdmin : supabase)
      .from('director_etapa_grupos')
      .select('grupo_id')
      .eq('director_etapa_id', directorId)
      .limit(500)
    if (asignErr) return NextResponse.json({ error: asignErr.message }, { status: 400 })
    const asignadosSet = new Set((asignaciones||[]).map(a => a.grupo_id))

    // Obtener grupos del segmento con temporada y estado activo
    const clientLectura = esSuperior ? supabaseAdmin : supabase
    let query = clientLectura.from('grupos')
      .select('id, nombre, segmento_id, segmento_ubicacion_id, activo, temporada:temporada_id (nombre)')
      .eq('segmento_id', segmentoId)
      .limit(500)
    if (soloAsignados) {
      // filtrar manual luego
    }
    const { data: gruposData, error: gruposErr } = await query
    if (gruposErr) return NextResponse.json({ error: gruposErr.message }, { status: 400 })
  const baseGrupos = (gruposData||[]).filter(g => !soloAsignados || asignadosSet.has(g.id))
  const grupoIds = baseGrupos.map(g => g.id)
  let countsMap = new Map<string, { count: number; sample: string[] }>()
  if (grupoIds.length) {
      // Obtener conteo de directores por grupo (hasta 3 nombres de muestra) usando una sola consulta agregada
      const { data: rels, error: relsErr } = await clientLectura
        .from('director_etapa_grupos')
        .select('grupo_id, director_etapa_id')
        .in('grupo_id', grupoIds)
        .limit(2000)
      if (!relsErr && rels) {
        const dirIds = [...new Set(rels.map(r => r.director_etapa_id))]
        let nombresMap = new Map<string, string>()
        if (dirIds.length) {
          const { data: dirsData } = await clientLectura
            .from('segmento_lideres')
            .select('id, usuario:usuario_id (nombre, apellido, email)')
            .in('id', dirIds)
            .eq('tipo_lider', 'director_etapa')
            .limit(500)
          for (const dRaw of (dirsData||[])) {
            const d: any = dRaw as any
            const u: any = d.usuario || {}
            let n = `${u.nombre || ''} ${u.apellido || ''}`.trim() || u.email || '(Sin nombre)'
            n = normalizarNombre(n)
            nombresMap.set(d.id, n)
          }
        }
        for (const rel of rels) {
          const entry = countsMap.get(rel.grupo_id) || { count: 0, sample: [] }
            entry.count += 1
            if (entry.sample.length < 3) {
              entry.sample.push(nombresMap.get(rel.director_etapa_id) || '—')
            }
            countsMap.set(rel.grupo_id, entry)
        }
      }
    }
    // grupoIds ya declarado anteriormente

    // Obtener miembros (para contar y detectar líderes) en lote
  let miembrosMap = new Map<string, { miembros: number; lideres: string[] }>()
  if (grupoIds.length) {
      // Paso 1: obtener filas base sin embed para evitar ambigüedad
      const { data: miembrosBase, error: miembrosErr } = await supabaseAdmin
        .from('grupo_miembros')
        .select('grupo_id, rol, usuario_id')
        .in('grupo_id', grupoIds)
        .is('fecha_salida', null)
        .limit(20000)
      if (!miembrosErr && miembrosBase) {
        const esRolLider = (rol:string) => {
          const r = rol.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'')
          return r === 'lider' // excluir colíder
        }
        // Primero: contar miembros y recolectar ids de líderes
        const liderIdsSet = new Set<string>()
        const lideresPorGrupo = new Map<string, string[]>() // guardar usuario_ids temporal
        for (const row of miembrosBase) {
          const entry = miembrosMap.get(row.grupo_id) || { miembros: 0, lideres: [] }
          entry.miembros += 1
          miembrosMap.set(row.grupo_id, entry)
          if (esRolLider(row.rol)) {
            liderIdsSet.add(row.usuario_id)
            const arr = lideresPorGrupo.get(row.grupo_id) || []
            if (arr.length < 6) arr.push(row.usuario_id) // guardar hasta 6 ids para luego truncar nombres a 3
            lideresPorGrupo.set(row.grupo_id, arr)
          }
        }
        // Fetch solo usuarios líderes
        const liderIds = [...liderIdsSet]
        let nombresMap = new Map<string, string>()
        if (liderIds.length) {
          const chunkSize = 500
          for (let i=0; i<liderIds.length; i+=chunkSize) {
            const slice = liderIds.slice(i, i+chunkSize)
            const { data: usuariosData, error: usuariosErr } = await supabaseAdmin
              .from('usuarios')
              .select('id, nombre, apellido, email')
              .in('id', slice)
              .limit(chunkSize)
            if (usuariosErr) {
              console.warn('[grupos-asignables] usuariosErr miembros', usuariosErr.message)
              continue
            }
            for (const u of (usuariosData||[])) {
              const comp = [u.nombre, u.apellido].filter(Boolean).join(' ').trim()
              let nombre = comp || u.email || '(Sin nombre)'
              nombre = normalizarNombre(nombre)
              nombresMap.set(u.id, nombre)
            }
          }
        }
        // Asignar nombres finales de líderes (máx 3) a miembrosMap
        for (const [gId, ids] of lideresPorGrupo.entries()) {
          const entry = miembrosMap.get(gId) || { miembros: 0, lideres: [] }
          entry.lideres = ids
            .map(id => normalizarNombre(nombresMap.get(id) || '(Sin nombre)'))
            .filter(Boolean)
            .slice(0,3)
          miembrosMap.set(gId, entry)
        }
      } else if (miembrosErr) {
        console.warn('[grupos-asignables] miembrosErr', miembrosErr.message)
      }
    }

    const grupos = baseGrupos.map((g:any) => {
      const miembrosInfo = miembrosMap.get(g.id) || { miembros: 0, lideres: [] }
      return {
        id: g.id,
  nombre: normalizarNombre(g.nombre),
        asignado: asignadosSet.has(g.id),
        directoresCount: countsMap.get(g.id)?.count || (asignadosSet.has(g.id) ? 1 : 0),
        directoresSample: countsMap.get(g.id)?.sample || [],
        temporadaNombre: g.temporada?.nombre || null,
        miembrosCount: miembrosInfo.miembros,
        lideres: miembrosInfo.lideres.slice(0,3),
        activo: g.activo
      }
    })
    return NextResponse.json({ directorId, segmentoId, grupos, total: grupos.length, asignados: asignadosSet.size })
  } catch (e: any) {
    console.error('[grupos-asignables GET] Exception', e)
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}

// POST bulk asignaciones { agregar:[], quitar:[], modo? }
export async function POST(req: Request, ctx: { params: Promise<{ segmentoId: string; directorId: string }> | { segmentoId: string; directorId: string } }) {
  try {
    const awaited = 'then' in ctx.params ? await ctx.params : ctx.params
    const { segmentoId, directorId } = awaited
    if (!segmentoId || !directorId) return NextResponse.json({ error: 'segmentoId y directorId requeridos' }, { status: 400 })
    const supabase = await createSupabaseServerClient()
    const supabaseAdmin = createSupabaseAdminClient()
    const userWithRoles = await getUserWithRoles(supabase)
    if (!userWithRoles) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const roles = userWithRoles.roles || []
    const esSuperior = roles.some(r => ['admin','pastor','director-general'].includes(r))
    if (!esSuperior) return NextResponse.json({ error: 'Permiso denegado', rolesActuales: roles }, { status: 403 })

    // Verificar director
    const { data: dirRow, error: dirErr } = await supabaseAdmin
      .from('segmento_lideres')
      .select('id, segmento_id, tipo_lider')
      .eq('id', directorId)
      .maybeSingle()
    if (dirErr) return NextResponse.json({ error: dirErr.message }, { status: 400 })
    if (!dirRow) return NextResponse.json({ error: 'Director no encontrado' }, { status: 404 })
    if (dirRow.segmento_id !== segmentoId) return NextResponse.json({ error: 'No pertenece al segmento' }, { status: 403 })
    if (dirRow.tipo_lider !== 'director_etapa') return NextResponse.json({ error: 'No es director_etapa' }, { status: 400 })

    let body: any
    try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  const agregar: string[] = Array.isArray(body.agregar) ? [...new Set((body.agregar as any[]).filter((x: any) => typeof x === 'string'))] as string[] : []
  const quitar: string[] = Array.isArray(body.quitar) ? [...new Set((body.quitar as any[]).filter((x: any) => typeof x === 'string'))] as string[] : []
    const modo: 'merge'|'replace' = body.modo === 'replace' ? 'replace' : 'merge'

    // Obtener asignaciones actuales
    const { data: asignAct, error: asignActErr } = await supabaseAdmin
      .from('director_etapa_grupos')
      .select('grupo_id')
      .eq('director_etapa_id', directorId)
      .limit(1000)
    if (asignActErr) return NextResponse.json({ error: asignActErr.message }, { status: 400 })
    const actualesSet = new Set((asignAct||[]).map(a => a.grupo_id))

    // Validar grupos pertenecen al segmento
    const todosReferenciados = [...new Set([...agregar, ...quitar])]
    if (todosReferenciados.length > 0) {
      const { data: gruposSeg, error: gErr } = await supabaseAdmin
        .from('grupos')
        .select('id')
        .eq('segmento_id', segmentoId)
        .in('id', todosReferenciados)
      if (gErr) return NextResponse.json({ error: gErr.message }, { status: 400 })
      const validIds = new Set((gruposSeg||[]).map(g => g.id))
      const invalid = todosReferenciados.filter(id => !validIds.has(id))
      if (invalid.length) return NextResponse.json({ error: 'Grupos fuera del segmento', invalid }, { status: 400 })
    }

    let agregarFinal: string[] = []
    let quitarFinal: string[] = []
    if (modo === 'replace') {
      const targetSet = new Set(agregar)
      agregarFinal = agregar.filter(id => !actualesSet.has(id))
      quitarFinal = [...actualesSet].filter(id => !targetSet.has(id))
    } else {
      agregarFinal = agregar.filter(id => !actualesSet.has(id))
      quitarFinal = quitar.filter(id => actualesSet.has(id))
    }

    let agregados = 0, quitados = 0
    if (agregarFinal.length) {
      const rows = agregarFinal.map(gid => ({ director_etapa_id: directorId, grupo_id: gid }))
      const { error: insErr } = await supabaseAdmin.from('director_etapa_grupos').insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
      agregados = agregarFinal.length
    }
    if (quitarFinal.length) {
      const { error: delErr } = await supabaseAdmin
        .from('director_etapa_grupos')
        .delete()
        .eq('director_etapa_id', directorId)
        .in('grupo_id', quitarFinal)
      if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })
      quitados = quitarFinal.length
    }

    const { count: totalAsignados } = await supabaseAdmin
      .from('director_etapa_grupos')
      .select('*', { count: 'exact', head: true })
      .eq('director_etapa_id', directorId)

    return NextResponse.json({ ok: true, modo, agregados, quitados, totalAsignados: totalAsignados || 0, directorId, segmentoId })
  } catch (e: any) {
    console.error('[grupos-asignables POST] Exception', e)
    return NextResponse.json({ error: e.message || 'Error interno' }, { status: 500 })
  }
}