# API de Usuarios

## POST /api/users/[id]/set-password

- **Descripción**: Permite a un administrador asignar una nueva contraseña a un usuario con cuenta de autenticación activa.
- **Permisos**: Solo rol `admin`.
- **Path params**:
  - `id` (string): `auth_id` del usuario objetivo (UUID de autenticación en Supabase Auth).
- **Payload**:
```json
{
  "newPassword": "una_contraseña_segura_123"
}
```
- **Validaciones**:
  - `newPassword`: mínimo 8 caracteres (validado con Zod).
- **Respuestas**:
  - 200 OK
    ```json
    { "ok": true, "message": "Contraseña actualizada correctamente" }
    ```
  - 400 Bad Request
    ```json
    { "error": "Payload inválido" }
    ```
  - 401 Unauthorized
    ```json
    { "error": "No autenticado" }
    ```
  - 403 Forbidden
    ```json
    { "error": "No autorizado. Solo administradores." }
    ```
  - 502 Bad Gateway (errores transitorios de red)
    ```json
    { "error": "No se pudo asignar la contraseña (servicio de auth no disponible)" }
    ```

### Notas de implementación
- El endpoint valida la sesión del solicitante con `createSupabaseServerClient()` y obtiene roles vía `getUserWithRoles()`.
- La operación se realiza con `createSupabaseAdminClient()` utilizando `SUPABASE_SERVICE_ROLE_KEY` (nunca exponer en el cliente).
- Incluye reintentos con backoff exponencial ante errores transitorios (reset by peer, ETIMEDOUT, etc.).
