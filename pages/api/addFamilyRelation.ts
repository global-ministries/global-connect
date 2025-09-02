import type { NextApiRequest, NextApiResponse } from 'next';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Método no permitido' });
  }

  const { usuario1_id, usuario2_id, tipo_relacion } = req.body;
  if (!usuario1_id || !usuario2_id || !tipo_relacion) {
    return res.status(400).json({ success: false, message: 'Faltan datos requeridos' });
  }

  const supabase = createSupabaseServerClient();
  try {
    // Validar duplicados
    const { data: existing, error: errorExisting } = await supabase
      .from('relaciones_usuarios')
      .select('id')
      .or(
        `and(usuario1_id.eq.${usuario1_id},usuario2_id.eq.${usuario2_id})` +
        `,and(usuario1_id.eq.${usuario2_id},usuario2_id.eq.${usuario1_id})`
      )
      .limit(1);

    if (errorExisting) {
      return res.status(500).json({ success: false, message: errorExisting.message });
    }
    if (existing && existing.length > 0) {
      return res.status(409).json({ success: false, message: 'Ya existe una relación entre estos usuarios' });
    }

    // Insertar relación
    const { data: inserted, error: errorInsert } = await supabase
      .from('relaciones_usuarios')
      .insert({
        usuario1_id,
        usuario2_id,
        tipo_relacion,
        es_principal: false,
      })
      .select()
      .maybeSingle();

    if (errorInsert) {
      return res.status(500).json({ success: false, message: errorInsert.message });
    }

    return res.status(200).json({ success: true, data: inserted });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err?.message || 'Error inesperado' });
  }
}
