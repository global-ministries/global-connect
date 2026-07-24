# Crear tríada pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.triada.create`
> **Estado del cambio:** propuesta

## Proposito

La tríada pastoral visibiliza la conversacion entre la persona acompanada, su mentor oficial y un tercer actor pastoral (coordinador de area o lider del nuevo paso). Su existencia traduce al diseno la decision pastoral de que el acompanamiento no recae en un solo lider, sino que se reparte entre quienes conocen a la persona en distintos contextos.

El sistema crea la tríada con cardinalidad tres fija, indicando si surge por **nuevo paso** que la persona toma o por **simultaneidad** (la persona ya esta en grupo de vida y empieza a servir). En el caso de nuevo paso (decision P4), la tríada se **crea de forma automatica** desde el evento pastoral de paso tomado (inscripcion a taller, bautismo, inscripcion a servicio), sin que un lider la cree manualmente. En simultaneidad, la creacion conserva el flujo de accion pastoral cuando aplique.

El estado inicial es `pending_confirmation` para que los miembros puedan confirmar su inclusion antes de que la tríada quede activa. Toda creacion queda registrada con su trazabilidad de auditoria.

## Requisitos

### REQ-01: cardinalidad-tres-fija
El sistema **debe** exigir exactamente tres personas en la tríada: la persona acompanada, el mentor oficial y un tercer actor pastoral. Cardinalidades distintas **no deben** ser aceptables en el MVP.

### REQ-02: tipo-de-tríada
El sistema **debe** exigir que se declare el tipo de la tríada: `nuevo_paso` cuando surge porque la persona toma un nuevo paso espiritual, o `simultaneidad` cuando la persona ya esta en grupo de vida y empieza a servir.

### REQ-03: creacion-automatica-por-nuevo-paso
Cuando se trata de una tríada por `nuevo_paso` (decision P4), el sistema **debe** crearla de manera automatica a partir del evento pastoral de paso tomado (inscripcion a taller, bautismo, inscripcion a servicio), identificando al lider del nuevo paso como tercer actor y conservando al mentor oficial resuelto por la cascada. **No** se requiere una accion manual del lider.

### REQ-04: estado-inicial-pendiente-de-confirmacion
El sistema **debe** crear la tríada en estado `pending_confirmation` y **no debe** considerarla activa hasta que los tres miembros hayan confirmado su inclusion.

### REQ-05: rechazo-de-creador-sin-rol-formal
El sistema **debe** rechazar la creacion si el actor que la solicita no tiene un rol formal pastoral, verificado por el permiso `pastoral.triada.create`. Esto aplica a la creacion por simultaneidad, donde un lider pastoral conserva la capacidad de iniciar la tríada; la creacion automatica por nuevo paso (P4) no requiere actor externo.

### REQ-06: trazabilidad-y-rechazo-pastoral
El sistema **debe** registrar el identificador del actor creador (o el evento pastoral de paso tomado cuando aplique) y la marca temporal de creacion, **y debe** rechazar intentos que no cumplan los requisitos previos con un mensaje en lenguaje pastoral neutro.

## Escenarios

### ESC-01: creacion-automatica-por-nuevo-paso
**Dado** que Carlos es el mentor oficial de Ana
**Y** Diana es la lider del taller al que Ana acaba de inscribirse
**Cuando** se persiste el evento pastoral de inscripcion al taller
**Entonces** el sistema crea la tríada automaticamente con tipo `nuevo_paso` (P4)
**Y** el registro queda en estado `pending_confirmation` con Ana, Carlos y Diana como los tres miembros
**Y** el sistema **no** requiere una accion manual de un lider para disparar la creacion.

### ESC-02: creacion-feliz-por-simultaneidad
**Dado** que Ana ya asiste al grupo de vida de Carlos y ahora empieza a servir en el area de Diana
**Cuando** un lider pastoral inicia la tríada declarando el tipo `simultaneidad` con Diana como tercer actor
**Entonces** el sistema crea el registro en estado `pending_confirmation`
**Y** Carlos queda como mentor oficial (el grupo de vida pesa mas que el area de servicio).

### ESC-03: rechazo-por-cardinalidad-incorrecta
**Dado** que un lider pastoral intenta crear una tríada con solo dos personas
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** indicar que la cardinalidad de la tríada es tres.

### ESC-04: rechazo-por-tipo-no-declarado
**Dado** que un lider pastoral intenta crear una tríada sin declarar el tipo
**Cuando** envia la solicitud al sistema
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** persistir registro alguno.

### ESC-05: rechazo-por-creador-sin-rol
**Dado** que Luis no tiene rol formal pastoral
**Cuando** Luis intenta crear una tríada de simultaneidad
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que solo un lider con rol formal puede crear una tríada.

### ESC-06: trazabilidad-consultable
**Dado** que se creo una tríada, sea por flujo manual de simultaneidad o automaticamente por nuevo paso
**Cuando** se consulta la trazabilidad del registro
**Entonces** el sistema **debe** devolver el origen (actor creador o evento pastoral de paso tomado) y la marca temporal de creacion.