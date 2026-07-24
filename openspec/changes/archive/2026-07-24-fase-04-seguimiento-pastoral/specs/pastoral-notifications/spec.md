# Notificaciones pastorales

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permisos cubiertos:** `pastoral.one_on_one.*`, `pastoral.triada.*`
> **Estado del cambio:** propuesta

## Proposito

Las notificaciones pastorales existen para que el acompanamiento no quede a merced de la memoria humana: el sistema recuerda al lider cuando un uno auno expira, avisa al director inmediato cuando un uno auno se cierra, mantiene a los miembros de la tríada informados sobre los cambios relevantes, **y avisa a ambos lados del 1:1 cuando se programa o se acerca la fecha** (decisiones P10 y P11). Esto traduce el principio pastoral "todo lo que empieza debe terminar" al ambito de la comunicacion.

El sistema reusa el buzon compartido de Fase 3, sin crear un buzon pastoral paralelo. Cada notificacion pastoral usa una plantilla versionada con prefijo `pastoral.` y se entrega en espanol neutro por defecto. Los canales del MVP son correo electronico y WhatsApp (P11); la notificacion push queda como tarea futura, fuera del MVP.

## Requisitos

### REQ-01: buzon-compartido-de-fase-3
El sistema **debe** entregar las notificaciones pastorales a traves del buzon compartido de Fase 3, sin crear un buzon pastoral paralelo.

### REQ-02: plantillas-versionadas
El sistema **debe** usar plantillas versionadas con prefijo `pastoral.` para cada tipo de notificacion pastoral. Las plantillas **deben** estar redactadas en espanol neutro.

### REQ-03: notificacion-a-ambos-al-programar
Cuando un uno auno se programa, el sistema **debe** emitir una notificacion al **mentor oficial y a los asistidos** (P10). La plantilla versionada `pastoral.one_on_one_scheduled.v1` se entrega por el buzon compartido de Fase 3 a las dos audiencias.

### REQ-04: recordatorio-a-ambos
Cuando se acerca la fecha de un uno auno, el sistema **debe** emitir una notificacion recordatoria al **mentor oficial y a los asistidos** (P11). Los canales del MVP son correo electronico y WhatsApp; la notificacion push queda documentada como tarea futura.

### REQ-05: disparadores-de-tríada-y-uno-auno-restantes
El sistema **debe** emitir notificaciones cuando un uno auno se completa, se cancela, se aproxima a su expiracion o se marca como no realizado, y cuando una tríada se forma, un miembro entra o sale, la tríada se disuelve, o un paso espiritual se valida.

### REQ-06: audiencia-y-rechazo-de-notificacion-sin-valor-pastoral
El sistema **debe** entregar cada notificacion a la audiencia adecuada segun el tipo de evento (mentor, director inmediato, miembros de la tríada, asistidos, pastor o administrador con permiso completo cuando aplique), y **no debe** emitir notificaciones que no aporten valor pastoral concreto (por ejemplo, ruido administrativo). El buzon **debe** mantenerse relevante para el acompanamiento.

## Escenarios

### ESC-01: notificacion-de-uno-auno-programado-a-ambos
**Dado** que Carlos programa un uno auno con Ana
**Cuando** se persiste la apertura del uno auno
**Entonces** el sistema encola una notificacion por la plantilla `pastoral.one_on_one_scheduled.v1` para Carlos (como mentor oficial) **y** para Ana (como asistida) (P10).

### ESC-02: notificacion-de-uno-auno-completado
**Dado** que Carlos cerro un uno auno como completado
**Cuando** se persiste el cierre
**Entonces** el sistema encola una notificacion para el director inmediato del area
**Y** la notificacion respeta la plantilla versionada correspondiente.

### ESC-03: recordatorio-del-uno-auno-a-ambos
**Dado** que Carlos y Ana tienen un uno auno programado en 24 horas
**Cuando** se dispara el disparador automatico de recordatorio
**Entonces** el sistema encola una notificacion recordatoria por la plantilla `pastoral.one_on_one_reminder.v1` para Carlos **y** para Ana (P11)
**Y** la entrega sale por los canales del MVP: correo electronico y WhatsApp
**Y** la notificacion push queda como tarea futura fuera del MVP.

### ESC-04: notificacion-de-tríada-formada
**Dado** que la tríada de Ana paso a estado `active`
**Cuando** se persiste la activacion
**Entonces** el sistema encola notificaciones para los tres miembros
**Y** las notificaciones salen en espanol neutro.

### ESC-05: notificacion-de-paso-espiritual-validado
**Dado** que Carlos valido un paso espiritual en el uno auno de Ana
**Cuando** se persiste la validacion
**Entonces** el sistema encola una notificacion para Ana, indicando el paso validado
**Y** **no debe** filtrar contenido de notas privadas del mentor.

### ESC-06: rechazo-de-buzon-paralelo
**Dado** que la entrega de notificaciones pastorales esta implementada
**Cuando** se inspecciona el codigo
**Entonces** **no debe** existir un buzon pastoral paralelo al buzon compartido de Fase 3
**Y** toda entrega pastoral **debe** pasar por el buzon compartido.

### ESC-07: trazabilidad-de-plantilla
**Dado** que se emitio una notificacion pastoral
**Cuando** se consulta el evento de notificacion
**Entonces** el sistema **debe** devolver el identificador de plantilla versionada usada
**Y** **debe** permitir rastrear que version se empleo en cada entrega.