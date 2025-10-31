# API de Grupos

## RPC: obtener_grupos_para_usuario

Devuelve los grupos visibles para el usuario autenticado con filtros, paginación y metadatos.

- Parámetros principales:
  - `p_auth_id` (uuid): ID del usuario autenticado (Supabase Auth).
  - Filtros opcionales: `p_segmento_id`, `p_temporada_id`, `p_activo`, `p_municipio_id`, `p_parroquia_id`.
  - Paginación: `p_limit`, `p_offset`.
  - Papelera: `p_eliminado` (boolean) — cuando es `true`, lista sólo grupos eliminados.
  - Filtros por pestaña — NUEVO:
    - `p_estado_temporal` (text | null): `'actual' | 'pasado' | 'futuro'`. Si es `null`, no filtra por estado temporal.
    - `p_solo_mios` (boolean): si `true`, devuelve sólo grupos donde el usuario es miembro.

- Campos de retorno clave:
  - `id`, `nombre`, `activo`, `eliminado`.
  - `segmento_nombre`, `temporada_nombre`.
  - `miembros_count`, `lideres`, `supervisado_por_mi`.
  - `soy_miembro` (boolean) — NUEVO: indica si el usuario autenticado es miembro del grupo.
  - `soy_lider` (boolean) — NUEVO: indica si el usuario es `Líder` o `Colíder` del grupo.
  - `hay_mis_grupos` (boolean) — NUEVO: indicador global (independiente de `limit`/`offset`) que señala si el usuario es miembro de al menos un grupo. Útil para UI (mostrar pestaña “Mis Grupos”).
  - `total_count` (window function) para paginación.
  - `estado_temporal` (text) — NUEVO: clasificación temporal del grupo según la temporada asociada.

Lógica de `estado_temporal`:

```sql
CASE
  WHEN t.fecha_inicio > CURRENT_DATE THEN 'futuro'
  WHEN g.activo = true AND t.fecha_inicio <= CURRENT_DATE AND t.fecha_fin >= CURRENT_DATE THEN 'actual'
  ELSE 'pasado'
END AS estado_temporal
```

- `futuro`: temporada aún no inicia.
- `actual`: grupo activo en temporada en curso.
- `pasado`: inactivo o temporada finalizada.

### Notas de paginación y pestañas (recomendado)

- Para cargar las primeras N filas de cada pestaña sin depender de otras pestañas, invoca la RPC por pestaña con sus filtros:
  - Actuales: `p_estado_temporal='actual'`
  - Pasados: `p_estado_temporal='pasado'`
  - Futuros: `p_estado_temporal='futuro'`
  - Mis Grupos: `p_solo_mios=true`
- `total_count` refleja el total del conjunto filtrado por esa invocación (es decir, por pestaña).
- `hay_mis_grupos` se calcula sobre el conjunto base sin paginación y permite decidir si mostrar la pestaña “Mis Grupos”.

### Ejemplos de uso

1) Mis Grupos, página 1 de 20

```ts
const { data, error } = await supabase.rpc('obtener_grupos_para_usuario', {
  p_auth_id: user.id,
  p_limit: 20,
  p_offset: 0,
  p_eliminado: false,
  p_solo_mios: true,
  p_estado_temporal: null,
})
```

2) Grupos actuales, página 3 de 50

```ts
const pageSize = 50
const page = 3
const { data, error } = await supabase.rpc('obtener_grupos_para_usuario', {
  p_auth_id: user.id,
  p_limit: pageSize,
  p_offset: (page - 1) * pageSize,
  p_eliminado: false,
  p_estado_temporal: 'actual',
  p_solo_mios: false,
})
```

## Actualizar Estado de Grupos en Lote

Permite a los usuarios con roles superiores activar o desactivar múltiples grupos en una sola operación.

- **Endpoint:** `POST /api/grupos/bulk-update-status`
- **Permisos Requeridos:** `admin`, `pastor`, `director-general`

### Request Body

```json
{
  "groupIds": ["uuid", "uuid"],
  "status": true
}
```

- **`groupIds`** (string[], required): Array con los IDs de los grupos a modificar.
- **`status`** (boolean, required): `true` para activar, `false` para desactivar.

### Responses

- **`200 OK`**: Si la operación fue exitosa.
  ```json
  {
    "message": "Grupos actualizados correctamente.",
    "count": 2
  }
  ```
- **`403 Forbidden`**: Si el usuario no tiene los permisos necesarios.
- **`400 Bad Request`**: Si el payload es inválido.
- **`500 Internal Server Error`**: Si ocurre un error en la base de datos.
