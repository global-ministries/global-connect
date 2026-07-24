# Crear uno a uno pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.one_on_one.create`
> **Estado del cambio:** propuesta

## Proposito

Crear un uno a uno pastoral es la primera accion de cualquier acompanamiento. Este acto queda protegido por una decision pastoral explicita: el sistema asigna al mentor oficial **automaticamente** por la cascada y **no expone un paso de confirmacion** para el lider (decision P2). La persona acompanada **no tiene opcion de rechazar** la asignacion (decision P3). La iglesia asigna; el asistido ora y acompaña.

El sistema crea el registro inicial en estado `pending_participant` y exige que el identificador del mentor oficial este presente y no sea nulo. Esto blinda el flujo contra el escenario problematico de un uno a uno "anonimo" sin autor pastoral asignado.

En el caso de pareja (P8), un unico registro de uno a uno cobija a los dos participantes, con un unico resumen al cierre y un unico historial de notificaciones.

## Requisitos

### REQ-01: requisito-de-lider-inmediato
El sistema **debe** exigir que el actor que crea el uno a uno sea un lider con rol formal (lider de grupo de vida, lider de taller o coordinador de servicio), verificado mediante el permiso `pastoral.one_on_one.create` en su contexto de sesion.

### REQ-02: asignacion-automatica-y-no-rechazable
El sistema **debe** resolver el mentor oficial por la cascada de forma automatica, sin solicitar confirmacion explicita del lider (P2). La persona acompanada **no debe** poder rechazar la asignacion resultante (P3).

### REQ-03: mentor-oficial-no-nulo
El sistema **debe** rechazar la creacion si el identificador del mentor oficial no esta presente o es nulo. El mentor oficial **debe** haber sido resuelto previamente por la cascada de resolucion.

### REQ-04: estado-inicial-pendiente-de-participante
El sistema **debe** crear el uno a uno en estado `pending_participant` y **no debe** considerarlo abierto hasta que la persona acompanada haya sido vinculada al registro.

### REQ-05: soporte-individual-y-de-pareja
El sistema **debe** permitir crear un uno a uno individual (una persona acompanada) o de pareja (dos personas en una misma unidad pastoral), ambos casos bajo un mismo registro de uno a uno (P8). Una pareja se modela como un unico `one_on_one` con dos filas en `participantes`, con un unico resumen al cierre.

### REQ-06: trazabilidad-y-rechazo-pastoral
El sistema **debe** registrar el identificador del actor que crea el uno a uno y la marca temporal de creacion, y **debe** rechazar los intentos que no cumplan los requisitos previos con un mensaje claro en lenguaje pastoral neutro.

## Escenarios

### ESC-01: creacion-individual-feliz
**Dado** que Carlos es lider de grupo de vida y tiene el permiso `pastoral.one_on_one.create`
**Y** Ana es una persona acompanada de su grupo
**Cuando** Carlos crea un uno auno con Ana como asistida y el como mentor oficial
**Entonces** el sistema crea el registro en estado `pending_participant` sin paso previo de confirmacion
**Y** Ana queda registrada como participante
**Y** Carlos queda registrado como mentor oficial y autor del registro.

### ESC-02: creacion-de-pareja-feliz
**Dado** que Carlos es lider de grupo de vida y tiene el permiso `pastoral.one_on_one.create`
**Y** Ana y Luis son una pareja del grupo
**Cuando** Carlos crea un uno auno declarando pareja con los dos
**Entonces** el sistema crea un unico registro de uno auno en estado `pending_participant`
**Y** Ana y Luis quedan vinculados como participantes en el mismo registro
**Y** el resumen, al cierre, sera compartido para ambos.

### ESC-03: rechazo-por-cascada-sin-resultado
**Dado** que la cascada de resolucion no devuelve un mentor oficial valido para Ana
**Cuando** Carlos intenta crear el uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** orientar a Carlos a revisar la pertenencia de Ana a grupo, taller o servicio antes de insistir
**Y** **no debe** aceptar una seleccion manual de mentor (P2).

### ESC-04: rechazo-por-actor-sin-rol-formal
**Dado** que Pedro no es lider con rol formal
**Cuando** intenta crear un uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que solo un lider con rol formal puede iniciar un acompanamiento.

### ESC-05: rechazo-por-intento-de-rechazo-de-la-persona
**Dado** que Ana es la persona acompanada del uno auno asignado a Carlos
**Cuando** Ana intenta solicitar un mentor alternativo
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** indicar que la iglesia asigna el mentor oficial (P3).

### ESC-06: trazabilidad-consultable
**Dado** que Carlos creo un uno auno con Ana
**Cuando** Carlos consulta el historial del registro
**Entonces** el sistema **debe** devolver el identificador de Carlos como autor y la marca temporal de creacion.