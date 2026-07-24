# Disolver tríada pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.triada.disband`
> **Estado del cambio:** propuesta

## Proposito

Disolver una tríada cumple el principio pastoral "todo lo que empieza debe terminar" para el ambito de la tríada. Toda tríada activa que pierde su proposito pastoral debe cerrarse con un motivo auditable, evitando tríadas que quedan abiertas sin conclusion clara.

El sistema permite la disolucion unicamente al mentor oficial, exige un motivo del catalogo cerrado y deja la tríada en estado terminal `disuelta`. Una tríada disuelta no se reforma: si la persona necesita acompanamiento pastoral nuevamente, se crea una tríada nueva bajo un contexto diferente.

## Requisitos

### REQ-01: solo-el-mentor-oficial-disuelve
El sistema **debe** permitir disolver la tríada unicamente al mentor oficial del registro, verificado por el permiso `pastoral.triada.disband`.

### REQ-02: estado-terminal-disuelta
El sistema **debe** llevar la tríada al estado terminal `disuelta` cuando se concreta la disolucion. Ninguna otra transicion posterior **debe** sacar la tríada de ese estado.

### REQ-03: motivo-obligatorio-del-catalogo
El sistema **debe** exigir un motivo del catalogo cerrado para la disolucion. Sin motivo, la operacion **no debe** proceder.

### REQ-04: rechazo-de-reforma
El sistema **debe** rechazar la reforma directa de una tríada disuelta. Si la persona necesita acompanamiento pastoral nuevamente, **debe** crearse una tríada nueva.

### REQ-05: trazabilidad-de-disolucion
El sistema **debe** emitir un evento pastoral inmutable cuando la disolucion se concreta, con el tipo de evento `triada_pastoral_disuelta` y los datos del mentor oficial, del motivo y de la fecha.

### REQ-06: rechazo-pastoral-amigable
El sistema **debe** rechazar intentos no autorizados con un mensaje en lenguaje pastoral neutro.

## Escenarios

### ESC-01: disolucion-feliz-con-motivo
**Dado** que Carlos es el mentor oficial de la tríada de Ana
**Y** la tríada esta activa
**Cuando** Carlos disuelve la tríada indicando un motivo del catalogo cerrado
**Entonces** el sistema lleva la tríada al estado terminal `disuelta`
**Y** persiste el motivo
**Y** emite el evento pastoral inmutable de disolucion.

### ESC-02: rechazo-de-disolucion-sin-motivo
**Dado** que Carlos intenta disolver la tríada sin indicar motivo
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que el motivo es obligatorio.

### ESC-03: rechazo-por-actor-no-oficial
**Dado** que Diana es tercer actor de la tríada pero no es la mentora oficial
**Cuando** Diana intenta disolver la tríada
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** modificar el estado del registro.

### ESC-04: rechazo-de-reforma-de-tríada-disuelta
**Dado** que la tríada de Ana fue disuelta por Carlos con motivo
**Cuando** Carlos intenta reactivar o reformar la misma tríada
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** sugerir crear una tríada nueva si la persona necesita acompanamiento pastoral nuevamente.

### ESC-05: rechazo-de-motivo-fuera-del-catalogo
**Dado** que Carlos intenta disolver la tríada indicando un motivo que no pertenece al catalogo cerrado
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** sugerir motivos validos del catalogo cerrado.

### ESC-06: trazabilidad-consultable
**Dado** que Carlos disolvio la tríada con motivo
**Cuando** se consulta el historial de la tríada
**Entonces** el sistema **debe** devolver el evento pastoral inmutable de disolucion con autor, motivo y fecha.