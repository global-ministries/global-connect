# Papelera de Grupos

Fecha: 2025-10-08  
Estado: Activo (v1)  
Autor: Equipo Plataforma Global Connect

## Objetivo
Habilitar eliminación reversible de grupos permitiendo a roles superiores administrar limpieza lógica sin pérdida definitiva de datos. Se introduce la columna `eliminado` para distinguir entre:
- `activo`: indica si el grupo está operativo (visible en flujos normales si no está en papelera)
- `eliminado`: indica si el grupo fue enviado a papelera (oculto de la vista principal salvo filtro explícito)

## Resumen de Cambios Técnicos
| Área | Cambio | Detalle |
|------|--------|---------|
| Base de Datos | Columna `eliminado boolean NOT NULL DEFAULT false` en `grupos` | Permite marcar papelera. |
| Índices | Índice parcial `idx_grupos_no_eliminados` (solo `WHERE eliminado = false`) | Optimiza listados habituales. |
| RPC | Extensión de `obtener_grupos_para_usuario` con parámetro `p_eliminado boolean` y retorno campo `eliminado` | Filtrado server-side; previene traer datos innecesarios. |
| Endpoints | `DELETE /api/grupos/:id` ahora marca `eliminado=true, activo=false` | Soft delete reversible. |
| Endpoints | `POST /api/grupos/:id/restore` restaura (`eliminado=false, activo=true`) | Recuperación. |
| UI | Botón "Enviar a Papelera" reemplaza eliminación dura; botón "Restaurar" en filas eliminadas | Acciones contextuales según rol/estado. |
| UI | Badge `Eliminado` con prioridad sobre estado activo/inactivo | Claridad visual. |
| Filtros | Nueva opción de estado `eliminado` | Vista dedicada de papelera. |
| Permisos | Restaurar y enviar a papelera restringido a roles: admin, pastor, director-general (extensible) | Control de acceso. |

## Firma Actual de la Función RPC
```sql
obtener_grupos_para_usuario(
  p_auth_id uuid,
  p_segmento_id uuid DEFAULT NULL,
  p_temporada_id uuid DEFAULT NULL,
  p_activo boolean DEFAULT NULL,
  p_municipio_id uuid DEFAULT NULL,
  p_parroquia_id uuid DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_eliminado boolean DEFAULT false
) RETURNS TABLE (
  id uuid,
  nombre text,
  activo boolean,
  eliminado boolean,
  segmento_nombre text,
  temporada_nombre text,
  fecha_creacion timestamptz,
  municipio_id uuid,
  municipio_nombre text,
  parroquia_id uuid,
  parroquia_nombre text,
  lideres json,
  miembros_count integer,
  supervisado_por_mi boolean,
  total_count bigint
)
```

## Lógica de Filtro `p_eliminado`
- `false` (default): retorna SOLO grupos no eliminados (`eliminado = false`).
- `true`: retorna SOLO grupos en papelera (`eliminado = true`).
- No soporta modo mixto intencionalmente para mantener uso del índice parcial y simplificar UI.

## Comportamiento de Estados
| Caso | activo | eliminado | Visible en vista normal | Visible en filtro Eliminado | Acción primaria | Acción secundaria |
|------|--------|-----------|-------------------------|-----------------------------|-----------------|------------------|
| Operativo | true | false | Sí | No | Enviar a Papelera | Desactivar (si existe flujo) |
| Inactivo (congelado) | false | false | Sí (con badge Inactivo) | No | Enviar a Papelera | Activar |
| En Papelera | (ignorado) | true | No | Sí | Restaurar | (Futuro: eliminación permanente) |

Nota: Al enviar a papelera se fuerza `activo=false` para evitar restauraciones ambiguas en histórico.

## Consideraciones de Rendimiento
- La mayoría del tráfico seguirá consultando `eliminado=false`, aprovechando el índice parcial.
- Contador total (`total_count`) se calcula vía ventana sobre el subconjunto filtrado, manteniendo paginación sin query adicional.
- Campos agregados (`lideres`, `miembros_count`) conservan coste proporcional al número de grupos en página; sin explosión de N+1 porque se encapsulan en subqueries correlacionadas sobre clave primaria.

## Estrategia de Restauración
1. Usuario con rol autorizado invoca `POST /api/grupos/:id/restore`.
2. Validaciones: existencia group + estado `eliminado=true`.
3. Transición: `eliminado=false, activo=true` (activación inmediata). Futuro: permitir restaurar manteniendo `activo=false` si se requiere revisión antes de operar.

## Seguridad y Permisos
- Roles con privilegio (hardcoded actualmente): `admin`, `pastor`, `director-general`.
- Visualización de grupos eliminados igualmente pasa por la función RPC: un usuario sin permiso sobre un grupo eliminado nunca podrá inferir su existencia.

## Posibles Extensiones Futuras
| Idea | Descripción | Prioridad |
|------|-------------|-----------|
| Eliminación permanente | Endpoint que purgue definitivamente tras X días en papelera | Media |
| Timestamp `deleted_at` | Reemplazar boolean por fecha para auditoría y expiración automática | Alta si se implementa purga |
| Auditoría detallada | Log estructurado (tabla `auditoria_eventos`) para delete/restore | Media |
| Batch restore/delete | Endpoints para operar múltiples IDs | Baja (UX actual suficiente) |
| Filtro combinado | Permitir ver todos (activos + papelera) para admins | Baja |

## Riesgos y Mitigaciones
| Riesgo | Mitigación Actual | Acción Futura |
|--------|-------------------|--------------|
| Pérdida accidental (doble acción) | Operación reversible + ausencia de purga | Añadir confirmación secundaria para eliminación permanente |
| Crecimiento de papelera | Solo listado bajo filtro específico | Implementar purga programada / job | 
| Rendimiento en líderes | Subquery ordenada por rol y apellido | Cache/mat view si escala |

## Ejemplos de Uso (SQL)
```sql
-- Listar activos (default)
select id, nombre from public.obtener_grupos_para_usuario('<auth>'::uuid, NULL,NULL,NULL,NULL,NULL,20,0,false);
-- Listar papelera
select id, nombre from public.obtener_grupos_para_usuario('<auth>'::uuid, NULL,NULL,NULL,NULL,NULL,20,0,true);
```

## Ejemplo Llamada desde Supabase JS
```ts
const { data, error } = await supabase.rpc('obtener_grupos_para_usuario', {
  p_auth_id: user.id,
  p_eliminado: true, // papelera
  p_limit: 20,
  p_offset: 0
});
```

## Checklist de Integración
- [x] Columna agregada y migrada.
- [x] Índice parcial creado.
- [x] RPC extendida y tipos corregidos (count casts).
- [x] Endpoints delete/restore adaptados.
- [x] UI (botones, badges, filtro) funcional.
- [x] Validado error 42702 y 42804 corregidos.

## Próximos Pasos Recomendados
1. Añadir doc sección en `sistema-permisos-usuarios-final.md` sobre permisos de papelera.
2. Generar test de smoke (script) para ciclo: crear → papelera → listar papelera → restaurar.
3. Evaluar timestamp `deleted_at` para auditoría y retención.

---
Para dudas adicionales, contactar al equipo backend.
