# API de Solicitudes de Grupo

> Última actualización: 2026-03-12

## Descripción

Sistema de solicitudes y aprobaciones para movimientos de miembros entre grupos de vida.
Soporta ingresos, traslados, egresos, cambios de rol y activación de grupos.

---

## RPC: crear_solicitud_grupo

Crea una solicitud de movimiento o ejecuta la acción directamente si el usuario tiene permisos de Director General o superior.

### Parámetros

| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_auth_id` | `uuid` | ✅ | Auth ID del usuario autenticado |
| `p_tipo` | `text` | ✅ | Tipo: `ingreso`, `traslado`, `egreso`, `cambio_rol`, `activacion_grupo` |
| `p_usuario_id` | `uuid` | ✅ | ID del usuario afectado |
| `p_grupo_id` | `uuid` | ✅ | ID del grupo destino |
| `p_grupo_origen_id` | `uuid` | ❌ | ID del grupo origen (solo traslados) |
| `p_rol_solicitado` | `text` | ❌ | Rol solicitado para el miembro |
| `p_motivo` | `text` | ❌ | Motivo de la solicitud |

### Retorno

```json
{ "ok": true, "modo": "directo|solicitud", "tipo": "ingreso", "solicitud_id": "uuid" }
```

- `modo: "directo"` — el usuario tenía permisos DG+ y la acción se ejecutó sin solicitud
- `modo: "solicitud"` — se creó una solicitud pendiente de aprobación

### Permisos

- Requiere autenticación: ✅
- Director de Etapa: crea solicitud (requiere aprobación del DG)
- Director General (scoped): ejecuta directamente si tiene asignación al segmento
- Admin / Pastor: ejecuta directamente (bypass global)

### Ejemplo

```typescript
const resultado = await crearSolicitudGrupo({
  tipo: "ingreso",
  usuario_id: "uuid-del-miembro",
  grupo_id: "uuid-del-grupo",
  motivo: "Solicitud de ingreso al grupo",
});
```

---

## RPC: procesar_solicitud_grupo

Procesa (aprueba o rechaza) una solicitud pendiente.

### Parámetros

| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_auth_id` | `uuid` | ✅ | Auth ID del usuario que procesa |
| `p_solicitud_id` | `uuid` | ✅ | ID de la solicitud |
| `p_accion` | `text` | ✅ | `aprobar` o `rechazar` |
| `p_notas` | `text` | ❌ | Notas del director |

### Retorno

```json
{ "ok": true, "accion": "aprobar", "solicitud_id": "uuid" }
```

### Permisos

- Solo Director General scoped al segmento del grupo, Admin o Pastor
- Validado por `es_director_general_de_grupo(p_auth_id, grupo_id)`

---

## RPC: expirar_solicitudes_vencidas

Marca como `expirado` las solicitudes cuyo `expira_en` ha pasado. Se llama automáticamente al listar solicitudes pendientes.

### Parámetros

Ninguno.

### Retorno

Void.

---

## RPC: contar_solicitudes_pendientes

Cuenta solicitudes pendientes visibles para el usuario (scoped por rol).

### Parámetros

| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_auth_id` | `uuid` | ✅ | Auth ID del usuario |

### Retorno

`integer` — cantidad de solicitudes pendientes.

---

## Función helper: es_director_general_de_grupo

Verifica si un usuario es Director General con scope sobre un grupo específico.

### Lógica

1. Resuelve `auth_id` → `usuario_id` interno
2. Si es superadmin → `TRUE` (bypass global)
3. Obtiene `segmento_id` del grupo
4. Verifica asignación en `director_general_segmentos`

### Parámetros

| Nombre | Tipo | Descripción |
|--------|------|-------------|
| `p_auth_id` | `uuid` | Auth ID |
| `p_grupo_id` | `uuid` | ID del grupo |

### Retorno

`boolean`

---

## Vista: v_solicitudes_pendientes

Vista que enriquece solicitudes pendientes con datos de miembro, grupo, segmento y temporada.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `id` | `uuid` | ID de la solicitud |
| `tipo` | `text` | Tipo de solicitud |
| `estado` | `text` | Estado actual |
| `grupo_nombre` | `text` | Nombre del grupo destino |
| `segmento_nombre` | `text` | Nombre del segmento |
| `miembro_nombre` | `text` | Nombre del miembro afectado |
| `solicitante_nombre` | `text` | Nombre de quien solicitó |
| `temporada_estado` | `text` | Estado de la temporada |
| `expira_en` | `timestamptz` | Fecha de expiración |

---

## Tablas

| Tabla | Propósito | RLS |
|-------|-----------|-----|
| `solicitudes_grupo` | Solicitudes de movimiento | ✅ |
| `historial_movimientos_grupo` | Registro de todos los movimientos | ✅ |
| `director_general_segmentos` | Asignaciones DG ↔ segmentos | ✅ |
| `configuracion_grupos_vida` | Configuración del módulo (expiración, límites) | ✅ |

---

## Server Actions

| Action | Archivo | Descripción |
|--------|---------|-------------|
| `crearSolicitudGrupo` | `solicitudes-grupo.actions.ts` | Crear solicitud o ejecutar directo |
| `procesarSolicitudGrupo` | `solicitudes-grupo.actions.ts` | Aprobar / rechazar solicitud |
| `listarSolicitudesPendientes` | `solicitudes-grupo.actions.ts` | Listar pendientes (scoped) |
| `contarSolicitudesPendientes` | `solicitudes-grupo.actions.ts` | Conteo para badge |
| `cancelarSolicitud` | `solicitudes-grupo.actions.ts` | Cancelar solicitud propia |
| `obtenerMisSolicitudes` | `solicitudes-grupo.actions.ts` | Mis solicitudes con relaciones |
| `agregarMiembroDirecto` | `solicitudes-grupo.actions.ts` | Wrapper para ingreso directo |
| `obtenerHistorialMiembro` | `solicitudes-grupo.actions.ts` | Historial de un miembro |
