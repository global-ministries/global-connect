import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// 1. Definir el esquema de validación con Zod
const bulkUpdateStatusSchema = z.object({
  seasonIds: z.array(z.string().uuid(), {
    required_error: 'El array de seasonIds es requerido.',
    invalid_type_error: 'seasonIds debe ser un array de strings.',
  }).min(1, 'Debe proporcionar al menos un ID de temporada.'),
  status: z.boolean({
    required_error: 'El campo status es requerido.',
    invalid_type_error: 'El campo status debe ser un booleano.',
  }),
});

// Roles permitidos para esta acción
const ROLES_PERMITIDOS = ['admin', 'pastor', 'director-general'];

export async function POST(req: NextRequest) {
  const supabase = await createSupabaseServerClient();

  // 2. Obtener y validar sesión/rol del usuario
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Usuario no autenticado.' }, { status: 401 });
  }

  const { data: rolesData, error: rolesError } = await supabase.rpc('obtener_roles_usuario', { p_auth_id: user.id });

  if (rolesError) {
    console.error('Error al obtener roles:', rolesError);
    return NextResponse.json({ error: 'Error al verificar permisos.' }, { status: 500 });
  }

  // La RPC devuelve directamente un array de strings (nombre_interno)
  const userRoles = rolesData || [];
  const tienePermiso = userRoles.some((rol: string) => ROLES_PERMITIDOS.includes(rol));

  if (!tienePermiso) {
    return NextResponse.json({ error: 'No tienes permiso para realizar esta acción.' }, { status: 403 });
  }

  // 3. Validar el payload de la solicitud
  const body = await req.json();
  const validation = bulkUpdateStatusSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json({ error: 'Payload inválido.', details: validation.error.flatten() }, { status: 400 });
  }

  const { seasonIds, status } = validation.data;

  try {
    // 4. Ejecutar la actualización con cliente de admin
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error } = await supabaseAdmin
      .from('temporadas')
      .update({ activa: status })
      .in('id', seasonIds)
      .select(); // .select() devuelve las filas actualizadas

    // 5. Manejar la respuesta
    if (error) {
      console.error('Error en la actualización de Supabase:', error);
      return NextResponse.json({ error: 'Error al actualizar las temporadas en la base de datos.' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'Temporadas actualizadas correctamente.',
      count: data?.length ?? 0,
    }, { status: 200 });

  } catch (e: any) {
    console.error('Excepción en el handler:', e);
    return NextResponse.json({ error: 'Ocurrió un error inesperado en el servidor.' }, { status: 500 });
  }
}
