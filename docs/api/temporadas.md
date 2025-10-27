# API de Temporadas

## Actualizar Estado de Temporadas en Lote

Permite a los usuarios con roles superiores activar o desactivar múltiples temporadas en una sola operación.

- **Endpoint:** `POST /api/temporadas/bulk-update-status`
- **Permisos Requeridos:** `admin`, `pastor`, `director-general`

### Request Body

```json
{
  "seasonIds": ["uuid", "uuid"],
  "status": true
}
```

- **`seasonIds`** (string[], required): Array con los IDs de las temporadas a modificar.
- **`status`** (boolean, required): `true` para activar, `false` para desactivar.

### Responses

- **`200 OK`**: Si la operación fue exitosa.
  ```json
  {
    "message": "Temporadas actualizadas correctamente.",
    "count": 2
  }
  ```
- **`403 Forbidden`**: Si el usuario no tiene los permisos necesarios.
- **`400 Bad Request`**: Si el payload es inválido.
- **`500 Internal Server Error`**: Si ocurre un error en la base de datos.
