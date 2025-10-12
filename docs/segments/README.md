# Segmentos - Directores y Gestión

## Resumen de Cambios (Oct 2025)
- **Preview de Directores (Detalle de Segmento)**: Lista vertical tipo "Miembros", sin límite y agrupada por cónyuges. Muestra foto + nombre + email.
- **Acceso a perfiles (clic)**: Sólo roles superiores pueden abrir el perfil del usuario. Roles superiores: `admin`, `pastor`, `director-general`, `director-etapa`. El rol `lider` ve el nombre como texto.
- **Página de Directores del Segmento**: Migrada de tabla a tarjetas responsive (desktop: 3 columnas; móvil: vertical). Incluye acciones: Ver grupos, Asignar grupos, Eliminar.
- **Modales**: "Ver grupos" y "Asignar grupos" rediseñados con el sistema de diseño (glassmorphism, badges, headers con gradiente, inputs `rounded-lg`).
- **Fotos de perfil**: Integradas en lista y modales usando `UserAvatar` con `foto_perfil_url`.

## Arquitectura y Archivos Clave
- UI
  - `app/dashboard/segments/[segmentoId]/page.tsx`: Detalle de segmento + preview de directores agrupados por cónyuges.
  - `app/dashboard/segments/[segmentoId]/directores/page.tsx`: Contenedor de gestión con layout tipo "Miembros".
  - `app/dashboard/segments/[segmentoId]/directores/DirectoresSegmentoClient.tsx`: Lista responsive de directores con acciones.
  - `app/dashboard/segments/[segmentoId]/directores/DirectorAssignedGroupsModal.tsx`: Modal "Ver grupos" (rediseño completo).
  - `app/dashboard/segments/[segmentoId]/directores/DirectorGroupsModal.tsx`: Modal "Asignar grupos" (rediseño completo).
- API/Hook
  - `app/api/segmentos/[segmentoId]/directores-etapa/route.ts`: Incluye `foto_perfil_url` y mantiene fallback tolerante a RLS.
  - `hooks/useSegmentDirectors.ts`: Tipado de `foto_perfil_url` en `DirectorEtapaEntry`.

## Lógica de Datos y RLS
- Para el preview de directores en `page.tsx`:
  1) Se consultan los IDs de directores desde `segmento_lideres` con el cliente estándar.
  2) Se cargan los datos de `usuarios` con `createSupabaseAdminClient()` para asegurar nombre y foto incluso bajo RLS.
  3) Se detectan parejas (cónyuges) en `relaciones_usuarios (tipo_relacion = 'conyuge')` y se agrupan.

- Para el endpoint `directores-etapa`:
  - Primero intenta join anidado (puede devolver 0 por RLS).
  - Fallback en dos pasos; se ajustó para retornar `foto_perfil_url` en ambos caminos.

## Reglas de Permisos (UI)
- Acceso a la sección Segmentos: `admin`, `pastor`, `director-general`, `director-etapa`, `lider`.
- Enlace a perfil de director (clic en nombre): sólo `admin`, `pastor`, `director-general`, `director-etapa`.
- `lider` ve el nombre como texto (no clickeable) pero visualiza foto y email.

## Diseño (Sistema de Diseño GlobalConnect)
- Tarjetas: `bg-white/50 border border-gray-200 rounded-xl p-4`.
- Headers de modales: gradiente `from-orange-50 to-white`, icono circular con gradiente `from-orange-500 to-pink-500`.
- Inputs: `rounded-lg`, `focus:ring-orange-400/40`.
- Badges: `BadgeSistema` variantes válidas: `default`, `success`, `warning`, `error`, `info`.
- Avatares: `UserAvatar` (foto o iniciales).

## Responsividad
- Desktop (≥ lg): Tarjetas de director en fila con 3 columnas: Identidad • Ciudad • Acciones.
- Móvil: Layout vertical apilado, selector de ciudad y acciones debajo del nombre.

## Acciones y Flujo
- Ver grupos: abre `DirectorAssignedGroupsModal` con filtros (buscar, temporada, estado) y lista en tarjetas.
- Asignar grupos: `DirectorGroupsModal` con checkboxes estilizados, modos de guardado (merge/replace) y confirmaciones.
- Eliminar director: restringido a roles superiores (validado en API `DELETE`).

## Consideraciones Técnicas
- Se añadió `foto_perfil_url` al DTO de directores en API y hook.
- Se corrigieron variantes de `BadgeSistema` (evitar `neutral`; usar `default`).
- Se añadió condicionamiento de clic al nombre del director según rol en `page.tsx`.
- Se usó `createSupabaseAdminClient()` para mostrar nombres/fotos en preview evitando bloqueos RLS.

## Ejemplo de Render (Preview de directores)
- Tarjeta por pareja o individuo.
- Dentro: avatar + nombre (link condicional) + email en segunda línea.

## Checklist
- [x] Preview sin límite y agrupado por cónyuges
- [x] Condición de clic por rol
- [x] Lista responsive tipo "Miembros"
- [x] Modales con diseño consistente
- [x] Fotos de perfil integradas
- [x] Endpoint y hook actualizados

## Próximos Pasos Sugeridos
- Agregar skeletons de carga a preview de directores.
- PR con capturas para revisión de diseño y accesibilidad.
