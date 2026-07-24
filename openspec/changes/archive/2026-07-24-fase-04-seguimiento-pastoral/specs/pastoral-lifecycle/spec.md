# Ciclo de vida del uno a uno y de la tríada pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permisos cubiertos:** `pastoral.one_on_one.*`, `pastoral.triada.*`
> **Estado del cambio:** propuesta

## Proposito

El ciclo de vida pastoral refleja el principio "todo lo que empieza debe terminar". Cada uno auno abierto debe terminar en un estado terminal, y cada tríada activa debe terminar en disolucion o completarse con un motivo auditable. Sin un ciclo de vida explicito, los registros se acumulan sin conclusion pastoral clara.

Para parejas (decision P8), el ciclo de vida es **compartido**: existe un unico estado compartido por el uno auno que cobija a los dos participantes, sin estados paralelos por persona. La transicion la ejecuta el mentor oficial y aplica para ambos.

El sistema define conjuntos cerrados de estados para el uno auno y para la tríada, una matriz de transiciones validas y un mecanismo de concurrencia optimista: cada escritura incrementa una version, y una escritura con version obsoleta se rechaza con el codigo de conflicto previsto.

## Requisitos

### REQ-01: estados-del-uno-auno
El sistema **debe** soportar los estados del uno auno: `pending_participant`, `scheduled`, `in_progress`, `completed`, `cancelled`. Los estados `completed` y `cancelled` **deben** ser terminales.

### REQ-02: estados-de-la-tríada
El sistema **debe** soportar los estados de la tríada: `pending_confirmation`, `active`, `disbanded`. El estado `disbanded` **debe** ser terminal.

### REQ-07: estado-compartido-en-pareja
El sistema **debe** mantener un unico estado compartido para el uno auno de pareja (P8): si el mentor oficial lleva el registro a un estado terminal, esa transicion aplica para ambos participantes sin generar transiciones paralelas.

### REQ-03: transiciones-validas-cerradas
El sistema **debe** aplicar una matriz cerrada de transiciones validas para cada entidad. Toda transicion fuera de la matriz **debe** ser rechazada.

### REQ-04: concurrencia-optimista-con-version
El sistema **debe** incrementar una version en cada escritura del uno auno y de la tríada. Una escritura con version obsoleta **debe** ser rechazada con codigo de conflicto, sin sobrescribir el estado actual.

### REQ-05: bitacora-de-cada-transicion
El sistema **debe** emitir un evento pastoral inmutable por cada transicion de estado, registrando el estado anterior, el estado nuevo, el motivo cuando aplique, el actor y la marca temporal.

### REQ-06: rechazo-de-transicion-sin-motivo-cuando-aplica
El sistema **debe** rechazar transiciones que exijan motivo (cancelacion de uno auno, disolucion de tríada) cuando el motivo no se haya proporcionado.

## Escenarios

### ESC-01: transicion-feliz-del-uno-auno
**Dado** que el uno auno de Ana esta en estado `scheduled`
**Cuando** Carlos lleva el uno auno a `in_progress` y luego a `completed` con resumen
**Entonces** el sistema acepta ambas transiciones
**Y** emite dos eventos pastorales inmutables, uno por cada cambio de estado.

### ESC-02: rechazo-de-transicion-fuera-de-matriz
**Dado** que el uno auno de Ana esta en estado `pending_participant`
**Cuando** Carlos intenta llevarlo directamente a `completed`
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** indicar las transiciones validas desde el estado actual.

### ESC-03: rechazo-por-version-obsoleta
**Dado** que Carlos leyo el uno auno con una version determinada
**Y** Diana escribio antes que Carlos con la misma version
**Cuando** Carlos intenta escribir con la version obsoleta
**Entonces** el sistema **debe** rechazar la operacion con codigo de conflicto
**Y** **no debe** sobrescribir el estado actual.

### ESC-04: transicion-de-tríada-a-disuelta
**Dado** que la tríada de Ana esta en estado `active`
**Cuando** Carlos la lleva a `disbanded` indicando motivo del catalogo cerrado
**Entonces** el sistema acepta la transicion
**Y** la tríada queda en estado terminal.

### ESC-05: rechazo-de-disolucion-sin-motivo
**Dado** que Carlos intenta llevar la tríada activa a `disbanded` sin motivo
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que el motivo es obligatorio.

### ESC-06: bitacora-completa-de-transiciones
**Dado** que el uno auno de Ana paso por tres transiciones y la tríada por dos
**Cuando** se consulta la bitacora pastoral
**Entonces** el sistema **debe** devolver cinco eventos pastorales inmutables, uno por cada transicion registrada.

### ESC-07: estado-compartido-en-pareja
**Dado** que Ana y Luis son pareja y comparten un unico uno auno en estado `scheduled`
**Cuando** Carlos lleva el registro a `completed` con un unico resumen acotado
**Entonces** el sistema registra una sola transicion a `completed`
**Y** **no debe** generar transiciones paralelas por participante (P8)
**Y** ambos quedan en estado compartido `completed`.