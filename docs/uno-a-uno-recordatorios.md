# Recordatorios de 1 a 1

El día antes de sus 1 a 1 `agendado`, cada persona (líder y dirigido) recibe UN
email que lista todos sus 1 a 1 de mañana, en orden de hora: con quién, cuándo
(hora de Caracas) y dónde si hay lugar. Asunto: "Recordatorio: tu 1 a 1 de
mañana" con uno solo y "Recordatorio: tus 1 a 1 de mañana" con varios. Nunca
lleva resumen, nota, celebración ni motivo.

## Cómo funciona

Cada corrida (7:00, 7:30, 8:00 y 8:30 Caracas) hace dos pasos:

1. **Encolar** — agrega una fila por cada persona con email de cada 1 a 1 de
   mañana. Es idempotente: encolar de nuevo el mismo día no duplica.
2. **Enviar** — toma TODAS las filas pendientes de hasta 100 personas (el máximo
   de un lote de Resend) y manda un email por persona, todos en UNA sola request
   al Batch API de Resend con validación `permissive`: si una dirección falla,
   las demás salen igual y solo esa persona queda para reintento. La idempotency
   key del lote es `uno-a-uno-recordatorios/<sha256 de los ids de sus filas>`,
   así que reintentar las mismas filas nunca manda dos veces.
3. **Resultado** — cada fila queda `enviado`, o vuelve a la cola con una espera
   creciente; después de 5 intentos queda `fallido`. Si toda la request falla
   (429 por límite o cuota, 5xx, red), todas sus filas vuelven a la cola. Si el
   1 a 1 se canceló, cambió de hora o ya empezó, la fila queda `descartado`.

La corrida de las 7:00 manda casi todo; las de 7:30, 8:00 y 8:30 solo encuentran
reintentos, lo que no entró en el tope y 1 a 1 creados después de las 7:00.

### Tope diario

Los recordatorios usan como máximo **60 emails por día UTC** (el día de cuota de
Resend). La cuenta está en el plan gratuito: 100 emails por día compartidos con
todos los emails de la app, así que quedan 40 libres para recuperar contraseña e
invitaciones. Lo que no entra queda pendiente para la próxima corrida y, si el
1 a 1 pasa, descartado. El tope y la cantidad de personas son parámetros de
`uno_a_uno_recordatorios_reclamar(p_personas, p_tope_diario)` y de
`enviarRecordatorios` (`personas`, `topeDiario`); si se pasa a un plan pago, se
sube el tope.

Una corrida usa una sola request (Resend acepta 10 por segundo por equipo).

La cola y sus funciones están en
`supabase/migrations/20261024220000_uno_a_uno_recordatorios.sql` y
`supabase/migrations/20261024240000_uno_a_uno_recordatorios_lote.sql`.

## Endpoint

| Qué | Llamada |
|-----|---------|
| Encolar y enviar un lote (lo que usa el cron) | `POST /api/uno-a-uno/recordatorios` (o `?accion=procesar`) |
| Solo encolar | `POST /api/uno-a-uno/recordatorios?accion=encolar` |
| Solo enviar un lote | `POST /api/uno-a-uno/recordatorios?accion=enviar` |

- `GET` hace lo mismo que `POST`.
- Auth: `Authorization: Bearer <UNO_A_UNO_RECORDATORIOS_SECRET>`.
- Respuestas: `202` con conteos (`{ encolados, reclamados, personas, enviados,
  fallidos }` por defecto; `{ encolados }` con `encolar`; `{ reclamados,
  personas, enviados, fallidos }` con `enviar`). `reclamados` cuenta filas;
  `personas`, `enviados` y `fallidos` cuentan emails. `400` si `accion` no es
  `procesar`, `encolar` ni `enviar`, `401` sin el secreto correcto, `503` si el
  secreto no está configurado y `500` si falla la base de datos.

## Variables de entorno

| Variable | Requerida | Notas |
|----------|-----------|-------|
| `UNO_A_UNO_RECORDATORIOS_SECRET` | Sí, solo servidor | Secreto del Bearer. El mismo valor va en Vault para pg_cron. |
| `NEXT_PUBLIC_SITE_URL` | No | Base del botón "Ver mis 1 a 1". Por defecto `https://connect.yosoyglobal.org`. |
| `RESEND_API_KEY` | Sí | La misma que usan los demás emails. |

Nunca pegues el valor real del secreto en documentos, issues, logs ni capturas.

## Programación (pg_cron + pg_net)

El secreto vive en Vault con el nombre `uno_a_uno_recordatorios_secret` (mismo
valor que `UNO_A_UNO_RECORDATORIOS_SECRET` en Vercel).

| Job | Horario (UTC) | Qué hace |
|-----|---------------|----------|
| `uno_a_uno_recordatorios` | `0,30 11-12 * * *` (7:00, 7:30, 8:00 y 8:30 Caracas) | `net.http_post` a `https://miembros.yosoyglobal.org/api/uno-a-uno/recordatorios` (acción por defecto: encolar + enviar) con `Authorization: Bearer` leído de `vault.decrypted_secrets`, `timeout_milliseconds := 60000`. |

Este job reemplaza a los dos anteriores, que se quitan:
`uno_a_uno_recordatorios_encolar` (`0 11 * * *`, encolaba por SQL directo) y
`uno_a_uno_recordatorios_enviar` (`*/5 11-13 * * *`).

```sql
select cron.unschedule('uno_a_uno_recordatorios_encolar');
select cron.unschedule('uno_a_uno_recordatorios_enviar');
select cron.schedule(
  'uno_a_uno_recordatorios',
  '0,30 11-12 * * *',
  $$
  select net.http_post(
    url := 'https://miembros.yosoyglobal.org/api/uno-a-uno/recordatorios',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                     where name = 'uno_a_uno_recordatorios_secret')
    ),
    timeout_milliseconds := 60000
  );
  $$
);
```

Para revisar: `select jobname, schedule, active from cron.job;` y las respuestas
en `net._http_response` (status 202 con los conteos).

### Rotar el secreto

1. Generar un valor nuevo y guardarlo en Vercel (`UNO_A_UNO_RECORDATORIOS_SECRET`,
   Production) y redeployar.
2. `select vault.update_secret(id, '<nuevo>') from vault.secrets where name = 'uno_a_uno_recordatorios_secret';`
3. Verificar con un `net.http_post` manual que la respuesta sea 202 (por ejemplo
   con `?accion=encolar`, que no manda emails).

### Apagar los recordatorios

`select cron.unschedule('uno_a_uno_recordatorios');`
