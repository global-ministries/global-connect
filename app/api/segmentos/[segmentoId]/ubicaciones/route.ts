import { NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'

// GET: lista de ubicaciones (crea si faltan las dos estándar)
export async function GET(_req: Request, { params }: { params: Promise<{ segmentoId: string }>}) {
  const supabase = createSupabaseAdminClient()
  const { segmentoId } = await params
  if (!segmentoId) return NextResponse.json({ error: 'segmentoId requerido'}, { status: 400 })

  // Asegurar filas base (Barquisimeto, Cabudare)
  for (const nombre of ['Barquisimeto','Cabudare']) {
    await supabase.from('segmento_ubicaciones').upsert({ segmento_id: segmentoId, nombre }, { onConflict: 'segmento_id,nombre' })
  }
  const { data, error } = await supabase.from('segmento_ubicaciones').select('id,nombre').eq('segmento_id', segmentoId).order('nombre')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ubicaciones: data })
}
