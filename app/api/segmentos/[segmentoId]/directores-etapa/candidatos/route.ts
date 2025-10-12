import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserWithRoles } from '@/lib/getUserWithRoles'

// Devuelve usuarios candidatos a ser directores de etapa para ESTE segmento.
// Criterios de inclusión:
//  - Usuarios con rol global 'director-etapa'
//  - O usuarios que ya son director_etapa en OTRO segmento (aunque no tengan el rol global)
// Exclusión:
//  - Ya listados como director_etapa en este segmento
// Soporta filtro ?q= (nombre parcial, case-insensitive simple en client side aquí)
export async function GET(req: Request, { params }: { params: Promise<{ segmentoId: string }>}) {
  const { segmentoId } = await params
  if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido' }, { status: 400 })
  const supabase = await createSupabaseServerClient()
  const userData = await getUserWithRoles(supabase)
  if (!userData) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const user = userData.user

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') || '').trim().toLowerCase()
  const debug = url.searchParams.get('debug') === '1'

  // Validar roles superiores
  const superior = userData.roles.some(r => ['admin','pastor','director-general'].includes(r))
  if (!superior) return NextResponse.json({ error: 'Permiso denegado' }, { status: 403 })

  // Usuarios ya directores en este segmento (excluir)
  const { data: existentes, error: exErr } = await supabase
    .from('segmento_lideres')
    .select('usuario_id')
    .eq('segmento_id', segmentoId)
    .eq('tipo_lider','director_etapa')
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const excluirActual = new Set((existentes || []).map(r => r.usuario_id))

  // a) Id del rol director-etapa
  const { data: rolDir, error: rolIdErr } = await supabase
    .from('roles_sistema')
    .select('id')
    .eq('nombre_interno','director-etapa')
    .limit(1)
    .single()
  if (rolIdErr) return NextResponse.json({ error: rolIdErr.message }, { status: 500 })

  // b) Usuarios con ese rol (solo ids)
  const { data: usuarioRolRows, error: urErr } = await supabase
    .from('usuario_roles')
    .select('usuario_id')
    .eq('rol_id', rolDir.id)
    .limit(2000)
  if (urErr) return NextResponse.json({ error: urErr.message }, { status: 500 })
  const idsPorRol = new Set((usuarioRolRows || []).map(r => r.usuario_id))

  // c) Directores en cualquier segmento (ids + segmento) - solo para marcar badge pero NO para ampliar pool base
  const { data: dirAnyRows, error: dirAnyErr } = await supabase
    .from('segmento_lideres')
    .select('usuario_id, segmento_id')
    .eq('tipo_lider','director_etapa')
    .limit(2000)
  if (dirAnyErr) return NextResponse.json({ error: dirAnyErr.message }, { status: 500 })
  const idsDirAny = new Set((dirAnyRows || []).map(r => r.usuario_id))

  // d) Candidatos: solo los con rol, excluyendo los ya en el segmento actual
  const baseIds = Array.from(idsPorRol).filter(id => !excluirActual.has(id))
  const allIds = baseIds

  let usuariosDetalles: { id: string; nombre: string; apellido?: string|null; email?: string|null }[] = []
  if (allIds.length) {
    const { data: usuariosData, error: uErr } = await supabase
      .from('usuarios')
      .select('id, nombre, apellido, email')
      .in('id', allIds)
      .limit(2000)
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    usuariosDetalles = usuariosData || []
  }

  const segsPorUsuario: Record<string, Set<string>> = {}
  for (const r of dirAnyRows || []) {
    if (!segsPorUsuario[r.usuario_id]) segsPorUsuario[r.usuario_id] = new Set()
    segsPorUsuario[r.usuario_id].add(r.segmento_id)
  }

  let candidatos = usuariosDetalles.map(u => {
    const nombre = `${u.nombre||''} ${u.apellido||''}`.trim() || u.email || '(Sin nombre)'
    const segs = segsPorUsuario[u.id] || new Set()
    const yaEnOtroSegmento = Array.from(segs).some(s => s !== segmentoId)
    return { id: u.id, nombre, yaEnOtroSegmento }
  })
  if (q) candidatos = candidatos.filter(c => c.nombre.toLowerCase().includes(q))
  candidatos.sort((a,b)=> a.nombre.localeCompare(b.nombre,'es'))

  if (debug) {
    return NextResponse.json({
      debug: true,
      total: candidatos.length,
      candidatos,
      metrica: {
        idsPorRol: idsPorRol.size,
        idsDirAny: idsDirAny.size,
        excluidosSegmentoActual: excluirActual.size,
        allIds: allIds.length
      }
    })
  }
  return NextResponse.json({ candidatos, total: candidatos.length })
}
