# Especificación de integración de agentes de soporte

Global Connect es la fuente de verdad para los tickets de soporte. Hermes, n8n, funciones de Inngest o cualquier otro agente externo pueden automatizar flujos de soporte únicamente a través de los límites durables de eventos y callbacks auditados descritos en este documento.

## Ruta rápida

1. Consumir eventos de soporte desde el flujo durable de despacho del outbox, no directamente desde Supabase.
2. Obtener o inferir solo los datos mínimos necesarios para la automatización.
3. Devolver acciones mediante `POST /api/support/external/inbound` usando una clave de idempotencia.
4. Permitir que Global Connect persista el estado canónico del ticket, mensajes, registros de auditoría y futuros eventos de outbox.

## Regla de arquitectura

| Componente | Responsabilidad |
|------------|-----------------|
| Global Connect | Es dueño de tickets, mensajes, eventos de auditoría, autorización, idempotencia y límites durables de eventos. |
| Supabase | Almacena el estado canónico de soporte. Los agentes externos no deben recibir credenciales de Supabase. |
| Support outbox | Tabla de cola durable escrita dentro de las mutaciones de tickets. Es la única fuente de despacho de eventos de soporte. |
| Ruta de drain | Ruta protegida de scheduler/worker que reclama filas pendientes del outbox y despacha eventos a proveedores. |
| Inngest | Ejecutor de workflows para despacho a proveedores y orquestación de automatizaciones. No es el sistema de registro. |
| Hermes / n8n / agentes | Procesadores downstream que pueden proponer respuestas públicas o notas internas mediante el inbound bridge. |

El principio crítico es simple: las herramientas externas pueden reaccionar a eventos de soporte, pero no son dueñas del estado de soporte.

## Flujo actual en producción

```text
Usuario o staff muta un ticket
  -> Global Connect valida autorización
  -> La mutación en Supabase escribe estado canónico
  -> La mutación en Supabase escribe evento de auditoría
  -> La mutación en Supabase escribe fila en support_event_outbox
  -> /api/support/outbox/drain reclama filas vencidas del outbox
  -> drain despacha evento ID-only al proveedor
  -> Inngest o proveedor compatible ejecuta automatización
  -> agente externo llama /api/support/external/inbound cuando tiene una acción segura
  -> Global Connect valida, deduplica, audita y escribe el mensaje/nota resultante
```

## Contrato de fuente de eventos

Los agentes no deben leer por polling ni mutar directamente `support_tickets`, `support_ticket_messages`, `support_ticket_events` o `support_event_outbox`. La fuente de eventos es la ruta protegida de drain.

### Ruta de drain

```http
GET  /api/support/outbox/drain
POST /api/support/outbox/drain
Authorization: Bearer <SUPPORT_OUTBOX_DRAIN_SECRET>
```

Respuesta esperada de éxito:

```json
{
  "claimed": 1,
  "dispatched": 1,
  "failed": 0
}
```

Notas operativas:

- `GET` existe para Vercel Cron.
- `POST` existe para llamadas manuales o schedulers externos.
- La ruta devuelve solo conteos. No debe exponer secretos ni contenido del ticket.
- El cron base de producción actualmente corre a diario en `0 8 * * *` UTC.
- Aumentar la cadencia solo después de confirmar que el plan de Vercel soporta el schedule deseado.

## Contrato de eventos salientes

Las filas del outbox se convierten en eventos para proveedores con IDs únicamente.

### Tipos de eventos soportados

| Tipo de evento outbox | Significado | IDs requeridos en payload |
|-----------------------|-------------|---------------------------|
| `support/ticket.created` | Se creó un ticket de soporte. | `eventId`, `ticketId`, `actorUserId` opcional |
| `support/ticket.message.created` | Se creó un mensaje público o de staff en soporte. | `eventId`, `ticketId`, `messageId`, `actorUserId` opcional |
| `support/ticket.status.changed` | Cambió el estado de un ticket de soporte. | `eventId`, `ticketId`, `actorUserId` opcional |

Los tipos de eventos no soportados se marcan como `failed` por el drain y no se reintentan indefinidamente.

### Forma del evento para proveedores

```json
{
  "id": "support:<eventId>",
  "name": "support/ticket.created",
  "data": {
    "eventId": "<uuid>",
    "ticketId": "<uuid>",
    "actorUserId": "<uuid optional>"
  }
}
```

Los eventos de mensaje creado incluyen `messageId`:

```json
{
  "id": "support:<eventId>",
  "name": "support/ticket.message.created",
  "data": {
    "eventId": "<uuid>",
    "ticketId": "<uuid>",
    "messageId": "<uuid>",
    "actorUserId": "<uuid optional>"
  }
}
```

## Integración con Inngest

Inngest es la capa preferida de workflow para automatización durable.

### Endpoint runtime

```http
/api/inngest/official
```

El endpoint lo sirve el adaptador oficial de Inngest para Next.js y registra funciones de soporte desde `lib/support/inngest-functions.ts`.

### Configuración de despacho

| Variable | Propósito |
|----------|-----------|
| `SUPPORT_OFFICIAL_INNGEST_ENABLED` | Habilita despacho por SDK oficial cuando está en `true`. |
| `INNGEST_EVENT_KEY` | Clave server-side de Inngest usada por el sender del SDK. |
| `SUPPORT_INNGEST_EVENT_URL` | Target opcional del webhook de compatibilidad. |
| `SUPPORT_INNGEST_WEBHOOK_SECRET` | Secreto bearer opcional para el webhook de compatibilidad. |

Si las variables del webhook custom no existen, Global Connect intenta el despacho oficial de Inngest cuando el despacho oficial está habilitado y existe una event key. Si ningún proveedor está configurado, el despacho se omite de forma segura y la app sigue funcionando.

### Comportamiento recomendado de funciones Inngest

1. Recibir el evento de soporte ID-only.
2. Ejecutar cualquier paso de automatización específico del proveedor, por ejemplo despacho hacia Hermes o n8n.
3. Mantener cada paso idempotente por `event.id` o `event.data.eventId`.
4. Nunca copiar cuerpo crudo del ticket, adjuntos, diagnósticos, tokens, cookies, signed URLs, object keys de R2 ni detalles internos de DB hacia herramientas downstream.
5. Devolver únicamente metadata de ejecución concisa.

## Integración con Hermes

Hermes debe seguir siendo un agente downstream. Puede recibir trabajo de soporte seguro e ID-first desde Inngest o un webhook compatible, pero debe devolver resultados mediante el inbound bridge.

### Salida hacia Hermes

Cuerpo recomendado del evento para Hermes:

```json
{
  "event_type": "support.ticket.created",
  "delivery_id": "global-connect:<eventId>",
  "source": {
    "system": "global-connect",
    "environment": "production"
  },
  "ticket": {
    "id": "<ticketId>",
    "internalUrl": "https://miembros.yosoyglobal.org/ayuda/tickets/<ticketId>"
  }
}
```

Reglas:

- Usar `event_type` en el cuerpo JSON para routing en Hermes.
- No depender de headers custom para routing.
- No enviar título crudo, descripción, datos del reportante, mensajes, adjuntos, diagnósticos ni secretos.
- Hermes puede incluir un resumen seguro legible por humanos solo después de que una política revisada permita explícitamente ese campo.

### Contrato de respuesta de Hermes

Hermes debe producir una de estas acciones:

```json
{
  "action": "public_reply",
  "message": "Mensaje seguro visible para el usuario.",
  "reason": "Por qué esto es seguro para publicar.",
  "needs_human": false,
  "github_candidate": false
}
```

o:

```json
{
  "action": "internal_note",
  "message": "Nota de triage visible solo para staff.",
  "reason": "Por qué requiere revisión de staff.",
  "needs_human": true,
  "github_candidate": false
}
```

`public_reply` está permitido solo para guía de autoservicio claramente segura. Casos ambiguos, sensibles, diagnósticos, de cuenta, mutación de datos, fechas/promesas o ingeniería deben usar `internal_note`.

## Integración con n8n

n8n debe conectarse como workflow downstream, no como cliente de base de datos.

### Flujo recomendado de n8n

```text
Función Inngest o webhook compatible
  -> webhook de n8n recibe evento ID-only
  -> n8n ejecuta pasos de clasificación/enriquecimiento
  -> n8n decide public_reply o internal_note
  -> n8n llama /api/support/external/inbound
  -> Global Connect persiste el resultado
```

### Entrada del webhook de n8n

Usar el mismo contrato de evento ID-only:

```json
{
  "id": "support:<eventId>",
  "name": "support/ticket.created",
  "data": {
    "eventId": "<uuid>",
    "ticketId": "<uuid>",
    "actorUserId": "<uuid optional>"
  }
}
```

### Callback inbound de n8n

n8n debe llamar a Global Connect con una clave estable de idempotencia:

```http
POST /api/support/external/inbound
Authorization: Bearer <SUPPORT_EXTERNAL_BRIDGE_TOKEN>
Content-Type: application/json
```

```json
{
  "ticketId": "<ticketId>",
  "idempotencyKey": "n8n:<workflowId>:<executionId>:<eventId>",
  "action": "internal_note",
  "message": "Resumen de triage del workflow para revisión de staff."
}
```

Forma recomendada de la clave de idempotencia:

```text
n8n:<workflow-id>:<execution-id>:<support-event-id>
```

Si n8n reintenta el mismo callback, debe reutilizar la misma clave de idempotencia.

## Integración de agentes genéricos

Cualquier agente puede integrarse de forma segura si respeta estos límites.

## Modelo de capacidades de agentes

Los agentes externos son procesadores con capacidades limitadas. Pueden observar eventos de soporte ID-only, clasificar trabajo, preparar respuestas seguras y escribir de vuelta únicamente mediante el inbound bridge auditado. No deben convertirse en actores privilegiados de la aplicación.

### Capacidades permitidas

| Capacidad | ¿Permitida? | Cómo debe funcionar |
|-----------|-------------|---------------------|
| Clasificar un evento de ticket | Sí | Usar el evento ID-only más cualquier contexto seguro explícitamente aprobado. |
| Proponer una respuesta pública | Sí | Devolver `action: "public_reply"` mediante `/api/support/external/inbound`; usar solo guía allowlisted de bajo riesgo. |
| Crear una nota de triage solo para staff | Sí | Devolver `action: "internal_note"`; es el valor por defecto para casos ambiguos o sensibles. |
| Marcar que se necesita revisión humana | Sí | Incluir esa señal en el contenido de la nota/mensaje o en metadata del agente donde esté soportado. |
| Señalar candidato a GitHub | Limitado | Puede indicar `github_candidate=true` en la salida del agente, pero no debe crear el issue. Requiere revisión de staff. |
| Deduplicar reintentos | Sí | Reutilizar el mismo `idempotencyKey` para el mismo intento de acción. |
| Llamar el callback inbound de Global Connect | Sí | Solo `POST /api/support/external/inbound` con `SUPPORT_EXTERNAL_BRIDGE_TOKEN`. |
| Ejecutar workflows específicos del proveedor | Sí | Hermes, n8n o herramientas custom pueden orquestar pasos internos siempre que Global Connect siga siendo el límite de escritura. |
| Producir metadata operativa | Sí | Debe ser concisa y libre de secretos/PII; útil para logs y revisión de auditoría. |

### Capacidades prohibidas

| Capacidad | ¿Permitida? | Razón |
|-----------|-------------|-------|
| Lecturas o escrituras directas en Supabase | No | Los agentes externos no deben recibir credenciales de base de datos ni saltarse autorización/auditoría de la app. |
| Actualizar estado del ticket | No | Los cambios de estado son acciones canónicas de soporte y deben permanecer dentro de Global Connect. |
| Asignar tickets | No | La asignación es una capacidad de staff/app, no de un agente externo. |
| Borrar, archivar u ocultar tickets | No | Retención y limpieza son operaciones explícitas de mantenimiento. |
| Crear issues de GitHub directamente | No | La integración con GitHub está diferida hasta que exista un flujo gated y revisado por staff. |
| Enviar emails al usuario directamente | No | El email al usuario debe permanecer bajo rutas de notificación aprobadas por Global Connect/proveedor. |
| Subir, descargar o inspeccionar adjuntos | No | Los adjuntos pueden contener datos sensibles y requieren autorización de la app. |
| Acceder a object keys de R2 o signed URLs | No | Object keys y signed URLs son detalles privados de implementación. |
| Acceder a diagnósticos crudos o payloads de Sentry | No | Los diagnósticos pueden contener datos sensibles y no deben copiarse downstream. |
| Hacer cambios irreversibles en producción | No | La mutación de producción pertenece solo a operaciones revisadas de Global Connect. |

### Presets de capacidad

Usar estos presets al incorporar una nueva herramienta.

| Preset | Herramientas previstas | Capacidades |
|--------|------------------------|-------------|
| `triage-note-only` | Agentes nuevos o no confiables | Recibir eventos ID-only; devolver solo `internal_note`. |
| `safe-reply` | Asistentes de soporte maduros | Devolver `internal_note` o `public_reply` allowlisted. |
| `workflow-orchestrator` | Inngest o n8n | Enrutar eventos, llamar procesadores downstream, aplicar idempotencia, llamar inbound bridge. |
| `engineering-candidate` | Agentes futuros de preparación para GitHub | Crear notas staff-only que marcan `github_candidate`; sin escritura directa en GitHub. |

Orden recomendado de rollout:

1. Iniciar toda integración nueva como `triage-note-only` en staging.
2. Promover a `safe-reply` solo después de revisar salidas reales por seguridad y utilidad.
3. Usar `workflow-orchestrator` para n8n/Inngest cuando la herramienta coordine múltiples pasos.
4. Agregar `engineering-candidate` solo cuando el equipo esté listo para revisar candidatos a GitHub manualmente.

### Matriz de decisión

| Situación | Acción del agente |
|-----------|-------------------|
| El usuario pide ayuda simple de navegación | `public_reply` si coincide con el allowlist. |
| El usuario pide guía de autoservicio para password/login | `public_reply` si no hay riesgo de recuperación de identidad o compromiso de cuenta. |
| El usuario reporta pérdida de datos, facturación, permisos, recuperación de cuenta o actividad sospechosa | `internal_note`. |
| El usuario incluye screenshots, diagnósticos, logs, identificadores o contexto sensible | `internal_note`; no copiar evidencia cruda. |
| El agente tiene incertidumbre | `internal_note`. |
| Un bug podría necesitar ingeniería | `internal_note` con señal `github_candidate=true` únicamente. |
| Ocurre un reintento de workflow | Reutilizar el mismo `idempotencyKey`; no crear un segundo mensaje. |

### Entrada del agente

Los agentes reciben únicamente:

- ID del evento
- ID del ticket
- ID opcional del actor usuario
- ID opcional del mensaje para eventos de mensaje
- una URL interna autenticada del ticket solo cuando sea necesario

Los agentes no deben recibir:

- claves service role de Supabase
- cookies de sesión del navegador
- access tokens de usuario
- credenciales de R2 u object keys
- signed URLs de adjuntos
- diagnósticos crudos
- payloads crudos de Sentry
- dumps internos de base de datos
- notas privadas de staff salvo revisión explícita

### Salida del agente

Los agentes solo pueden devolver:

- `public_reply`
- `internal_note`

Ningún agente puede directamente:

- actualizar estado de tickets
- asignar tickets
- crear issues de GitHub
- subir adjuntos
- borrar registros de soporte
- mutar Supabase
- enviar email al usuario fuera de las rutas aprobadas por Global Connect

## Contrato del inbound bridge

Todos los agentes downstream deben devolver trabajo mediante el inbound bridge auditado.

```http
POST /api/support/external/inbound
Authorization: Bearer <SUPPORT_EXTERNAL_BRIDGE_TOKEN>
Content-Type: application/json
```

### Cuerpo de la solicitud

```json
{
  "ticketId": "<uuid>",
  "idempotencyKey": "<stable-source-key>",
  "action": "public_reply",
  "message": "Mensaje a agregar al ticket."
}
```

### Acciones

| Acción | Resultado |
|--------|-----------|
| `public_reply` | Agrega un mensaje público de soporte visible para el reportante y staff. |
| `internal_note` | Agrega una nota staff-only visible solo para staff autorizado. |

### Idempotencia

El mismo callback siempre debe reutilizar el mismo `idempotencyKey`. Los callbacks duplicados no deben crear mensajes duplicados.

Formas recomendadas de claves:

| Fuente | Forma de clave |
|--------|----------------|
| Hermes | `hermes:<delivery-id>:<action>` |
| n8n | `n8n:<workflow-id>:<execution-id>:<support-event-id>` |
| Agente custom | `<agent-name>:<run-id>:<support-event-id>:<action>` |

## Reglas de seguridad y privacidad

Estas reglas son obligatorias para toda integración.

- No exponer credenciales de Supabase a agentes externos.
- No enviar secretos o valores con forma de secreto en prompts, payloads, logs, screenshots o comentarios.
- No enviar descripciones crudas de tickets ni cuerpos de mensajes downstream salvo que una política revisada permita explícitamente el campo exacto.
- No enviar adjuntos, signed URLs, object keys de R2, diagnósticos, headers, cookies, access tokens, payloads de Sentry ni identificadores internos de DB.
- Preferir notas internas sobre respuestas públicas cuando la respuesta sea incierta o sensible.
- Mantener todas las salidas externas cortas, sanitizadas y auditables.
- Mantener los reintentos idempotentes.
- Tratar los agentes externos como procesadores no confiables, no como componentes privilegiados de la aplicación.

## Plantillas de workflow

### Workflow de respuesta pública segura

```text
support/ticket.created
  -> Inngest recibe evento ID-only
  -> Hermes/n8n clasifica el caso como autoservicio seguro
  -> agente devuelve public_reply mediante inbound bridge
  -> Global Connect almacena mensaje público y fila de auditoría
  -> staff puede revisar el timeline del ticket
```

Usar esto solo para guía allowlisted como ayuda de navegación, instrucciones de cambio de password o aclaración simple de estado.

### Workflow de triage para staff

```text
support/ticket.created
  -> Inngest recibe evento ID-only
  -> agente detecta ambigüedad, datos sensibles o follow-up de ingeniería
  -> agente devuelve internal_note mediante inbound bridge
  -> Global Connect almacena nota staff-only y fila de auditoría
  -> staff humano decide la siguiente acción
```

Este es el workflow por defecto cuando el agente no está completamente seguro.

### Workflow futuro de GitHub

La creación de issues de GitHub permanece diferida. Cuando se apruebe más adelante, el flujo seguro debería ser:

```text
Agente devuelve internal_note con github_candidate=true
  -> staff revisa el candidato
  -> Global Connect o un workflow revisado crea un issue usando contenido sanitizado aprobado por staff
  -> el ticket guarda una referencia al issue solo después de una creación exitosa
```

Los agentes no deben crear issues de GitHub directamente hasta que ese workflow esté explícitamente implementado y revisado.

## Checklist de verificación

- [ ] Las mutaciones de soporte en producción siguen funcionando sin proveedor externo configurado.
- [ ] Las filas de outbox se escriben por mutaciones de ticket y se drenan solo mediante `/api/support/outbox/drain`.
- [ ] Los eventos para proveedores contienen únicamente IDs.
- [ ] Inngest, Hermes, n8n o workflows custom son idempotentes por ID de evento.
- [ ] Los agentes llaman solo `/api/support/external/inbound` para escritura de vuelta.
- [ ] Los callbacks duplicados no crean mensajes duplicados.
- [ ] `public_reply` se usa solo para guía allowlisted de bajo riesgo.
- [ ] Los casos ambiguos o sensibles se convierten en `internal_note`.
- [ ] Ningún workflow externo recibe claves de Supabase, claves de R2, signed URLs, cookies, tokens, diagnósticos crudos o adjuntos.
- [ ] La limpieza, borrado o mutación de estado en producción sigue siendo una operación revisada de Global Connect, no una capacidad del agente.

## Siguiente paso

Para una nueva integración, comenzar en staging:

1. Configurar solo secretos de staging/preview.
2. Enviar un evento ID-only mediante el flujo de drain del outbox.
3. Probar que el workflow downstream devuelve un `internal_note` mediante `/api/support/external/inbound`.
4. Verificar la idempotencia de callbacks duplicados.
5. Revisar logs para detectar filtración de secretos o PII antes de habilitar producción.
