# Validar un paso espiritual dentro del uno a uno pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.one_on_one.validate_step`
> **Estado del cambio:** propuesta

## Proposito

Validar un paso espiritual es uno de los actos mas sensibles del acompanamiento pastoral: la decision pastoral "el sistema sugiere, el mentor valida" significa que ningun artefacto de la plataforma puede, por si solo, "promover" a una persona en su camino espiritual. Esta capacidad traduce esa decision al diseno: solo el mentor oficial puede validar un paso, y la validacion queda registrada como un evento pastoral inmutable en la trayectoria de la persona.

La separacion leer vs validar (P5) se respeta explicitamente: aunque el pastor o administrador tenga permiso completo de lectura (`pastoral.read.all`), ese permiso **no habilita** validar pasos en nombre del mentor oficial. La validacion sigue siendo exclusiva del mentor oficial del uno auno o de la tríada.

El sistema debe rechazar la validacion cuando el actor no sea el mentor oficial, cuando la combinacion de uno auno y paso ya haya sido validada (idempotencia), o cuando el uno auno no se encuentre en un estado que admita la accion. La validacion es puntual: cada paso tiene un solo acto de validacion, y nadie puede validar dos veces el mismo paso.

## Requisitos

### REQ-01: solo-el-mentor-oficial-valida
El sistema **debe** permitir validar un paso espiritual unicamente al mentor oficial del uno auno, verificado por el permiso `pastoral.one_on_one.validate_step`. El permiso completo de lectura del pastor o administrador **no** es suficiente para validar (P5).

### REQ-02: rechazo-de-auto-validacion
El sistema **no debe** permitir que la persona acompanada valide sus propios pasos, aunque tenga capacidades tecnicas para hacerlo. La auto-validacion **debe** quedar siempre rechazada.

### REQ-03: idempotencia-por-combinacion
El sistema **debe** rechazar validaciones repetidas para la misma combinacion de uno auno y paso espiritual. Solo se permite una validacion por par.

### REQ-04: separacion-leer-vs-validar
El sistema **no debe** permitir que la capacidad unica de lectura completa (`pastoral.read.all`) habilite la validacion de pasos espirituales en nombre del mentor oficial (P5). La validacion sigue siendo exclusiva del mentor oficial del uno auno o de la tríada.

### REQ-05: registro-del-evento-pastoral
El sistema **debe** escribir un evento pastoral inmutable cuando la validacion se concreta, con el tipo de evento `paso_espiritual_validado_en_uno_auno` y los datos del mentor, del uno auno y del paso.

### REQ-06: estado-del-uno-auno-requisito
El sistema **debe** exigir que el uno auno se encuentre en un estado que admita la validacion (`en_curso` o equivalente activo). La validacion **no debe** proceder si el uno auno esta en estado terminal.

## Escenarios

### ESC-01: validacion-feliz-por-el-mentor
**Dado** que Carlos es el mentor oficial del uno auno con Ana
**Y** el uno auno esta en estado activo
**Cuando** Carlos valida el paso espiritual del bautismo para Ana
**Entonces** el sistema registra el evento pastoral inmutable
**Y** Ana queda asociada al paso validado en su camino espiritual.

### ESC-02: rechazo-de-auto-validacion
**Dado** que Ana es la persona acompanada del uno auno
**Cuando** Ana intenta validar su propio paso espiritual
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que solo el mentor oficial puede validar el paso.

### ESC-03: rechazo-por-actor-no-autorizado
**Dado** que Luis no es el mentor oficial del uno auno
**Cuando** Luis intenta validar un paso espiritual en ese uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** escribir evento pastoral alguno.

### ESC-04: rechazo-por-uno-auno-en-estado-terminal
**Dado** que el uno auno con Ana esta cerrado como completado
**Cuando** Carlos intenta validar un paso espiritual sobre ese uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** escribir evento pastoral alguno.

### ESC-05: rechazo-por-validacion-duplicada
**Dado** que Carlos ya valido el paso de bautismo para Ana en ese uno auno
**Cuando** Carlos intenta validar el mismo paso nuevamente
**Entonces** el sistema **debe** rechazar la operacion por duplicidad
**Y** **no debe** escribir un segundo evento pastoral para esa combinacion.

### ESC-06: rechazo-con-permiso-completo-sin-validar
**Dado** que Pablo es pastor con permiso completo de lectura
**Cuando** Pablo intenta validar un paso espiritual en nombre de Carlos
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** confirmar que el permiso completo de lectura no habilita la validacion (P5).

### ESC-07: rechazo-de-cualquier-rol-que-no-sea-mentor-oficial
**Dado** que el actor solicitante **no** es el mentor oficial del uno auno
**Cuando** el actor intenta validar un paso espiritual
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** indicar que solo el mentor oficial puede validar el paso
**Y** el rechazo aplica por igual a otros mentores, directores de area, pastores con permiso completo y a la propia persona acompanada.