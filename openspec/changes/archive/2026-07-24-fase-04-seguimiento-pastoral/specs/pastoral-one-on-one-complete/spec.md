# Completar uno a uno pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.one_on_one.complete`
> **Estado del cambio:** propuesta

## Proposito

Cerrar un uno auno es el cumplimiento del principio pastoral "todo lo que empieza debe terminar". Un uno auno que queda en estado intermedio sin motivo se convierte en una carga pastoral muda, y por eso la plataforma exige que cada uno auno abierto termine en uno de los estados terminales previstos, con su motivo correspondiente cuando proceda.

El sistema permite cerrar el uno auno como completado o como cancelado. El cierre como completado exige un resumen acotado a quinientos caracteres, redactado como reporte general y nunca como detalle pastoral sensible profundo. El cierre como cancelado exige un motivo del catalogo cerrado. Cualquier cierre emite un evento pastoral inmutable. Para parejas (P8), el cierre **produce un unico resumen** compartido entre los dos participantes, nunca dos resúmenes paralelos.

## Requisitos

### REQ-01: cierre-por-el-mentor-oficial
El sistema **debe** permitir cerrar el uno auno unicamente al mentor oficial del registro, verificado por el permiso `pastoral.one_on_one.complete`.

### REQ-02: estados-terminales
El sistema **debe** permitir cerrar el uno auno en uno de los dos estados terminales: `completado` o `cancelado`. Cualquier otro estado intermedio **no debe** ser aceptable como cierre. Para parejas (P8), el ciclo de vida es compartido: el cierre del registro cierra el uno auno para ambos.

### REQ-03: resumen-acotado-y-general
El sistema **debe** exigir un resumen de cierre acotado a quinientos caracteres cuando el estado terminal sea `completado`. El resumen **debe** ser un reporte general, sin detalles pastorales sensibles profundos. Para parejas (P8), el sistema exige un solo resumen compartido: el rechazo de un segundo resumen paralelo es absoluto.

### REQ-04: motivo-de-cancelacion-obligatorio
El sistema **debe** exigir un motivo del catalogo cerrado cuando el estado terminal sea `cancelado`. Sin motivo, el cierre **no debe** proceder.

### REQ-05: rechazo-de-resumen-excesivo
El sistema **debe** rechazar cierres con resumenes que excedan los quinientos caracteres o que contengan patrones sensibles (documentos de identidad, salud, confesiones, crisis).

### REQ-06: trazabilidad-de-cierre
El sistema **debe** emitir un evento pastoral inmutable cuando el cierre se concreta, con el tipo de evento `uno_auno_pastoral_completado` y los datos del mentor, del estado terminal y, cuando aplique, del motivo.

## Escenarios

### ESC-01: cierre-como-completado
**Dado** que Carlos es el mentor oficial del uno auno con Ana
**Y** el uno auno esta en estado activo
**Cuando** Carlos cierra el uno auno como `completado` con un resumen general
**Entonces** el sistema registra el estado terminal `completado`
**Y** persiste el resumen general
**Y** emite el evento pastoral inmutable de cierre.

### ESC-02: cierre-como-cancelado-con-motivo
**Dado** que Carlos es el mentor oficial del uno auno con Ana
**Cuando** Carlos cierra el uno auno como `cancelado` indicando un motivo del catalogo cerrado
**Entonces** el sistema registra el estado terminal `cancelado`
**Y** persiste el motivo
**Y** emite el evento pastoral inmutable de cierre.

### ESC-03: rechazo-de-cancelacion-sin-motivo
**Dado** que Carlos intenta cerrar el uno auno como `cancelado` sin indicar motivo
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que el motivo es obligatorio.

### ESC-04: rechazo-de-resumen-excesivo
**Dado** que Carlos intenta cerrar el uno auno como `completado` con un resumen de mas de quinientos caracteres
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** aceptar el cierre con un resumen que supere el limite.

### ESC-05: rechazo-de-resumen-con-patron-sensible
**Dado** que Carlos intenta cerrar el uno auno con un resumen que contiene un patron sensible
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** sugerir reformular el resumen como reporte general.

### ESC-06: rechazo-por-actor-no-oficial
**Dado** que Luis no es el mentor oficial del uno auno
**Cuando** Luis intenta cerrar el uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** modificar el estado del registro.

### ESC-07: cierre-de-pareja-con-un-unico-resumen
**Dado** que Ana y Luis son pareja y comparten un uno auno creado por Carlos
**Cuando** Carlos cierra el uno auno como `completado` con un unico resumen acotado
**Entonces** el sistema registra un solo cierre con un solo resumen compartido
**Y** **no debe** generar un registro paralelo para el segundo participante
**Y** ambos visualizan el mismo `resumen` en su historial compartido (P8).