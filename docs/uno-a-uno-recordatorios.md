# Recordatorios de 1 a 1

El día antes de cada 1 a 1 `agendado`, el líder y la persona reciben un email
("Recordatorio: tu 1 a 1 de mañana"). Los envíos salen de una cola, de a pocos,
para no mandar todo junto.

## Cómo funciona

1. **Encolar** — todos los días a las 7:00 (Caracas) pg_cron llama la función
   de encolar, que agrega una fila por cada persona con email de cada 1 a 1 de
   mañana. (`?accion=encolar` del endpoint hace lo mismo, para uso manual.)
2. **Enviar** — cada 5 minutos entre las 7:00 y las 9:55 (Caracas) se toma una
   tanda de hasta 25 filas y se manda de a un email, con 600 ms entre envíos
   (Resend acepta 2 por segundo). Cada fila usa la idempotency key
   `uno-a-uno-recordatorio/{id}`.
3. **Resultado** — cada fila queda `enviado`, o vuelve a la cola con una espera
   creciente; después de 5 intentos queda `fallido`. Si el 1 a 1 se canceló o
   cambió de hora, la fila queda `descartado`.

La cola y sus funciones están en
`supabase/migrations/20261024220000_uno_a_uno_recordatorios.sql`.

## Endpoint

| Qué | Llamada |
|-----|---------|
| Encolar | `POST /api/uno-a-uno/recordatorios?accion=encolar` |
| Enviar una tanda | `POST /api/uno-a-uno/recordatorios` (o `?accion=enviar`) |

- `GET` hace lo mismo que `POST`.
- Auth: `Authorization: Bearer <UNO_A_UNO_RECORDATORIOS_SECRET>`.
- Respuestas: `202` con conteos (`{ encolados }` o
  `{ reclamados, enviados, fallidos }`), `400` si `accion` no es `encolar` ni
  `enviar`, `401` sin el secreto correcto, `503` si el secreto no está
  configurado y `500` si falla la base de datos.

## Variables de entorno

| Variable | Requerida | Notas |
|----------|-----------|-------|
| `UNO_A_UNO_RECORDATORIOS_SECRET` | Sí, solo servidor | Secreto del Bearer. El mismo valor va en Vault para pg_cron. |
| `NEXT_PUBLIC_SITE_URL` | No | Base del botón "Ver mis 1 a 1". Por defecto `https://connect.yosoyglobal.org`. |
| `RESEND_API_KEY` | Sí | La misma que usan los demás emails. |

Nunca pegues el valor real del secreto en documentos, issues, logs ni capturas.

## Programación (pg_cron + pg_net)

Configurado en producción el 2026-10-24. El secreto vive en Vault con el nombre
`uno_a_uno_recordatorios_secret` (mismo valor que `UNO_A_UNO_RECORDATORIOS_SECRET`
en Vercel).

| Job | Horario (UTC) | Qué hace |
|-----|---------------|----------|
| `uno_a_uno_recordatorios_encolar` | `0 11 * * *` (7:00 Caracas) | `select public.uno_a_uno_recordatorios_encolar()` directo en la base, sin HTTP. |
| `uno_a_uno_recordatorios_enviar` | `*/5 11-13 * * *` (7:00–9:55 Caracas) | `net.http_post` a `https://miembros.yosoyglobal.org/api/uno-a-uno/recordatorios?accion=enviar` con `Authorization: Bearer` leído de `vault.decrypted_secrets`, `timeout_milliseconds := 60000`. |

Para revisar: `select jobname, schedule, active from cron.job;` y las respuestas
del envío en `net._http_response` (status 202 con los conteos).

### Rotar el secreto

1. Generar un valor nuevo y guardarlo en Vercel (`UNO_A_UNO_RECORDATORIOS_SECRET`,
   Production) y redeployar.
2. `select vault.update_secret(id, '<nuevo>') from vault.secrets where name = 'uno_a_uno_recordatorios_secret';`
3. Verificar con un `net.http_post` manual que la respuesta sea 202.

### Apagar los recordatorios

`select cron.unschedule('uno_a_uno_recordatorios_encolar');` y
`select cron.unschedule('uno_a_uno_recordatorios_enviar');`
