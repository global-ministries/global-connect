import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Row = {
  nombre_grupo?: string
  segmento?: string
  temporada?: string
  miembros?: string // formato: "Nombre Apellido|Líder, Otro Miembro|Miembro"
}

function parseCSV(text: string): Row[] {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const header = lines[0].split(',').map(h => h.trim().toLowerCase())
  const idx = {
    nombre_grupo: header.indexOf('nombre_grupo'),
    segmento: header.indexOf('segmento'),
    temporada: header.indexOf('temporada'),
    miembros: header.indexOf('miembros'),
  }
  const rows: Row[] = []
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim())
    rows.push({
      nombre_grupo: idx.nombre_grupo >= 0 ? cols[idx.nombre_grupo] : undefined,
      segmento: idx.segmento >= 0 ? cols[idx.segmento] : undefined,
      temporada: idx.temporada >= 0 ? cols[idx.temporada] : undefined,
      miembros: idx.miembros >= 0 ? cols[idx.miembros] : undefined,
    })
  }
  return rows
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

    const form = await req.formData()
    const file = form.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'Falta archivo CSV (campo file)' }, { status: 400 })
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length === 0) return NextResponse.json({ error: 'CSV vacío o inválido' }, { status: 400 })

    // Pre-cargar catálogos: temporadas y segmentos por nombre
    const [temporadasRes, segmentosRes] = await Promise.all([
      supabase.from('temporadas').select('id, nombre'),
      supabase.from('segmentos').select('id, nombre')
    ])
    if (temporadasRes.error || segmentosRes.error) return NextResponse.json({ error: 'No se pudieron cargar catálogos' }, { status: 500 })
    const temporadasMap = new Map((temporadasRes.data || []).map(t => [t.nombre.toLowerCase(), t.id]))
    const segmentosMap = new Map((segmentosRes.data || []).map(s => [s.nombre.toLowerCase(), s.id]))

    const admin = createSupabaseAdminClient()

    const resultados: Array<{ fila: number; ok: boolean; detalle: string; grupoId?: string }> = []

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      const filaN = i + 2 // considerando header
      const segId = r.segmento ? segmentosMap.get(r.segmento.toLowerCase()) : undefined
      const tempId = r.temporada ? temporadasMap.get(r.temporada.toLowerCase()) : undefined
      if (!segId || !tempId) {
        resultados.push({ fila: filaN, ok: false, detalle: 'Segmento o temporada no encontrados' })
        continue
      }

      // Permiso para crear en ese segmento
      const { data: permitido } = await supabase.rpc('puede_crear_grupo', { p_auth_id: user.id, p_segmento_id: segId })
      if (!permitido) {
        resultados.push({ fila: filaN, ok: false, detalle: 'Sin permiso para crear en el segmento' })
        continue
      }

      // Crear grupo (si nombre vacío, fallback simple: Segmento 1)
      const nombreGrupo = r.nombre_grupo?.trim() || `${r.segmento} 1`
      const { data: newGroup, error: gErr } = await admin
        .from('grupos')
        .insert({ nombre: nombreGrupo, segmento_id: segId, temporada_id: tempId })
        .select('id')
        .single()
      if (gErr || !newGroup?.id) {
        resultados.push({ fila: filaN, ok: false, detalle: `Error creando grupo: ${gErr?.message || 'desconocido'}` })
        continue
      }

      const grupoId = newGroup.id as string

      // Procesar miembros: "Nombre Apellido|Líder, Otro|Miembro"
      const miembrosTxt = (r.miembros || '').trim()
      const miembros = miembrosTxt ? miembrosTxt.split(/\s*;\s*|\s*,\s*/).filter(Boolean) : []
      for (const item of miembros) {
        const [nombreCompleto, rolRaw] = item.split('|').map(s => (s || '').trim())
        if (!nombreCompleto) continue
        const partes = nombreCompleto.split(/\s+/)
        const apellido = partes.length > 1 ? partes.pop()! : ''
        const nombre = partes.join(' ') || apellido
        const rolCsv = (rolRaw || 'Miembro').toLowerCase()
        // Normalizar rol: permitir "lider" y "miembro" (aprendiz no via CSV según requerimiento)
        let rol: 'Líder' | 'Miembro' = rolCsv.startsWith('lider') ? 'Líder' : 'Miembro'

        // Buscar usuario por nombre+apellido exactos (ideal: por email/cedula, pero CSV no lo trae)
        const { data: existingUser, error: uErr } = await admin
          .from('usuarios')
          .select('id')
          .ilike('nombre', nombre)
          .ilike('apellido', apellido)
          .maybeSingle()
        let usuarioId: string | null = existingUser?.id || null
        if (uErr) {
          resultados.push({ fila: filaN, ok: false, detalle: `Error buscando usuario: ${uErr.message}` })
        }
        if (!usuarioId) {
          // Crear usuario mínimo
          const { data: created, error: cErr } = await admin
            .from('usuarios')
            .insert({ nombre, apellido })
            .select('id')
            .single()
          if (cErr || !created) {
            resultados.push({ fila: filaN, ok: false, detalle: `Error creando usuario: ${cErr?.message || 'desconocido'}` })
            continue
          }
          usuarioId = created.id
          // Asignar rol del sistema Miembro por defecto (si existe)
          const { data: roleData } = await admin.from('roles_sistema').select('id').eq('nombre_interno', 'miembro').single()
          if (roleData?.id) {
            await admin.from('usuario_roles').insert({ usuario_id: usuarioId, rol_id: roleData.id })
          }
        }

        // Agregar a grupo
        const { error: agErr } = await admin
          .from('grupo_miembros')
          .insert({ grupo_id: grupoId, usuario_id: usuarioId, rol })
        if (agErr) {
          resultados.push({ fila: filaN, ok: false, detalle: `Error agregando miembro: ${agErr.message}` })
        }
      }

      resultados.push({ fila: filaN, ok: true, detalle: 'Grupo creado', grupoId })
    }

    return NextResponse.json({ ok: true, resultados })
  } catch (e: any) {
    console.error('[import/grupos] error', e)
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
