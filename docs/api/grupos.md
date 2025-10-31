# API de Grupos

## RPC: obtener_grupos_para_usuario

Devuelve los grupos visibles para el usuario autenticado con filtros, paginación y metadatos.

- Parámetros principales:
  - `p_auth_id` (uuid): ID del usuario autenticado (Supabase Auth).
  - Filtros opcionales: `p_segmento_id`, `p_temporada_id`, `p_activo`, `p_municipio_id`, `p_parroquia_id`.
  - Paginación: `p_limit`, `p_offset`.
  - Papelera: `p_eliminado` (boolean) — cuando es `true`, lista sólo grupos eliminados.

- Campos de retorno clave:
  - `id`, `nombre`, `activo`, `eliminado`.
  - `segmento_nombre`, `temporada_nombre`.
  - `miembros_count`, `lideres`, `supervisado_por_mi`.
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
