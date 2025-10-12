# PR: Directores de Segmento – Preview, Lista Responsive y Modales Rediseñados

## Resumen
Este PR implementa una mejora integral en la gestión de Directores de Etapa dentro de Segmentos.
Incluye un preview sin límite agrupado por cónyuges, lista responsive tipo "Miembros" y el rediseño de los modales "Ver grupos" y "Asignar grupos" con el sistema de diseño de GlobalConnect.
También integra fotos de perfil y un manejo de RLS que asegura que todos los roles puedan ver nombre y foto en el preview.

## Contexto
- Solicitud: "Segment Director Preview Grouping" y consistencia visual con la página de miembros.
- Requerimientos: mostrar todos los directores, agrupar cónyuges en tarjetas, nombre clickeable al perfil, email debajo, y mantener consistencia responsive.
- Permisos: líderes deben ver los nombres pero no deben poder abrir el perfil (clic deshabilitado para `lider`).

## Cambios Clave
- Preview de directores en `app/dashboard/segments/[segmentoId]/page.tsx`:
  - Sin límite y agrupado por cónyuges (`relaciones_usuarios` con `tipo_relacion = 'conyuge'`).
  - Tarjetas glass: `bg-white/50 border border-gray-200 rounded-xl p-4`.
  - `UserAvatar` con `foto_perfil_url`.
  - Enlace al perfil condicionado por rol (clic sólo para `admin`, `pastor`, `director-general`, `director-etapa`; `lider` ve texto).
  - Fallback RLS robusto: IDs por `segmento_lideres` (cliente estándar) + datos de `usuarios` con `createSupabaseAdminClient()` para evitar bloqueos.

- Página de Directores del segmento `app/dashboard/segments/[segmentoId]/directores/page.tsx`:
  - Layout tipo "Miembros" con header (icono + título) y contenedor glass.

- Lista de directores `DirectoresSegmentoClient.tsx`:
  - Reemplazo de tabla por tarjetas responsive.
  - Desktop: 3 columnas (Identidad • Ciudad • Acciones). Móvil: layout vertical.
  - Acciones preservadas: Ver grupos, Asignar grupos, Eliminar; y selector de ciudad con toasts.
  - `UserAvatar` con `photoUrl`.

- Modales rediseñados:
  - `DirectorAssignedGroupsModal.tsx` (Ver grupos): centrado, headers con gradiente, filtros consistentes, tarjetas glass, `BadgeSistema`.
  - `DirectorGroupsModal.tsx` (Asignar grupos): centrado, modos de guardado (merge/replace) con explicación, filtros, checkboxes estilizados, y modales de confirmación coherentes.

- API y Hook:
  - `app/api/segmentos/[segmentoId]/directores-etapa/route.ts`: añade `foto_perfil_url` en join y fallback; corrige uso de `user` en POST.
  - `hooks/useSegmentDirectors.ts`: agrega `foto_perfil_url` a `DirectorEtapaEntry`.

## Archivos Afectados
- UI
  - `app/dashboard/segments/[segmentoId]/page.tsx`
  - `app/dashboard/segments/[segmentoId]/directores/page.tsx`
  - `app/dashboard/segments/[segmentoId]/directores/DirectoresSegmentoClient.tsx`
  - `app/dashboard/segments/[segmentoId]/directores/DirectorAssignedGroupsModal.tsx`
  - `app/dashboard/segments/[segmentoId]/directores/DirectorGroupsModal.tsx`
- API/Hook
  - `app/api/segmentos/[segmentoId]/directores-etapa/route.ts`
  - `hooks/useSegmentDirectors.ts`
- Docs
  - `docs/segments/README.md`

## UI/UX
- Consistencia con "Miembros" y sistema de diseño (glassmorphism, `BadgeSistema`, gradientes, inputs `rounded-lg`).
- Responsive completo (desktop/móvil) con layouts claros.
- Nombres clickeables según rol; email visible con truncado.

## Seguridad y RLS
- Vista de nombres/fotos garantizada para todos los roles en preview usando `createSupabaseAdminClient()` (solo para lectura de datos de usuario por IDs de directores visibles).
- Clic a perfil restringido por rol en UI.
- API `DELETE` mantiene validación de roles superiores.

## Cómo Probar
1. Iniciar sesión como `admin` o `pastor`:
   - Abrir `Dashboard > Segmentos > [segmento]`.
   - Ver en el preview nombres y fotos; los nombres deben ser clickeables.
2. Iniciar sesión como `director-etapa`:
   - Mismo comportamiento que roles superiores.
3. Iniciar sesión como `lider`:
   - Ver nombres y fotos, pero el nombre no debe ser enlace (no clickeable).
4. Ir a `Abrir gestión` y validar lista responsive, selector de ciudad y acciones.
5. Abrir "Ver grupos" y "Asignar grupos" y validar diseño, filtros y confirmaciones.

## Capturas (añadir en el PR)
- Preview de directores (desktop)
- Lista de directores (desktop y móvil)
- Modal Ver grupos
- Modal Asignar grupos

## Checklist
- [x] Preview sin límite agrupado por cónyuges
- [x] Fotos de perfil integradas (`foto_perfil_url`)
- [x] Lista responsive tipo "Miembros"
- [x] Modales rediseñados y consistentes
- [x] Clic condicionado por rol (no clic para `lider`)
- [x] Endpoint y hook actualizados
- [x] Documentación actualizada (`docs/segments/README.md`)

## Riesgos y Mitigaciones
- Uso de admin client para lectura de `usuarios` en preview: alcance limitado a IDs previamente visibles por RLS en `segmento_lideres`.
- Performance: consultas acotadas por lista de IDs; sin `SELECT *`.

## Notas de Despliegue
- No requiere migraciones.
- Asegurar que variables de entorno del admin client estén configuradas en el entorno.

## Rama
- `feature/director-etapa-grupos-asignados`
- Base sugerida: `main` (o `develop` si se usa flujo GitFlow)

---
Cualquier feedback de diseño/UX es bienvenido. Se pueden adjuntar capturas en este PR para cerrar la revisión visual.
