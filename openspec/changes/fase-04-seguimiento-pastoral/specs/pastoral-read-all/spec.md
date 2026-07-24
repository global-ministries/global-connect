# Permiso completo de lectura pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.read.all`
> **Estado del cambio:** propuesta

## Proposito

El permiso completo de lectura pastoral existe para que el pastor o el administrador puedan ejercer acompanamiento institucional sin perder acceso a la memoria pastoral de la iglesia. Este permiso es una **separacion explicita de poderes** (P5): permite leer todo, pero **no permite validar pasos**, ni escribir notas privadas en nombre de otros mentores, ni disolver o cancelar registros ajenos. Validar pasos sigue siendo exclusivo del mentor oficial del 1:1 o de la tríada, porque la decision pastoral "el sistema sugiere, el mentor valida" no admite que un actor administrativo "promueva" a una persona en su camino espiritual por la via del permiso completo.

El permiso completo se otorga por defecto al pastor y al administrador, y **no habilita** ninguna accion de validacion, escritura pastoral o transicion de estado ajena.

## Requisitos

### REQ-01: otorgamiento-a-pastor-y-administrador
El sistema **debe** otorgar el permiso completo de lectura pastoral al pastor y al administrador por defecto, sin requerir configuracion adicional.

### REQ-02: lectura-completa-de-uno-auno
El sistema **debe** permitir a quien posea el permiso completo leer el contenido completo de cualquier uno auno, incluidas las notas privadas del mentor autor.

### REQ-03: lectura-completa-de-tríada
El sistema **debe** permitir a quien posea el permiso completo leer el contenido completo de cualquier tríada, incluidas las notas privadas del mentor autor.

### REQ-04: separacion-leer-vs-validar
El sistema **no debe** permitir a quien posea el permiso completo validar pasos espirituales en nombre del mentor oficial (P5). La validacion sigue siendo exclusiva del mentor oficial del uno auno o de la tríada.

### REQ-05: no-habilita-escritura-pastoral-ajena
El sistema **no debe** permitir a quien posea el permiso completo escribir notas privadas en nombre de otros mentores, ni completar o cancelar unos auno ajenos, ni disolver tríadas ajenas. La escritura pastoral sigue siendo exclusiva del mentor oficial autor (P5).

### REQ-06: trazabilidad-y-rechazo-de-extension-a-otros-actores
El sistema **debe** registrar todo acceso realizado bajo el permiso completo, dejando constancia del actor, del recurso accedido y de la marca temporal, y **no debe** otorgar el permiso completo a actores que no sean pastor o administrador por defecto. Cualquier otorgamiento adicional debe pasar por una decision pastoral explicita.

## Escenarios

### ESC-01: lectura-completa-de-uno-auno
**Dado** que Pablo es pastor con permiso completo
**Cuando** Pablo consulta cualquier uno auno
**Entonces** el sistema devuelve el contenido completo del uno auno
**Y** las notas privadas del mentor autor quedan visibles para Pablo.

### ESC-02: lectura-completa-de-tríada
**Dado** que Pablo es pastor con permiso completo
**Cuando** Pablo consulta cualquier tríada
**Entonces** el sistema devuelve el contenido completo de la tríada
**Y** las notas privadas del mentor autor quedan visibles para Pablo.

### ESC-03: rechazo-de-validacion-con-permiso-completo
**Dado** que Pablo es pastor con permiso completo pero no es mentor oficial de un uno auno
**Cuando** Pablo intenta validar un paso espiritual en ese uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** confirmar que el permiso completo no habilita la validacion.

### ESC-04: rechazo-a-actor-no-pastor-ni-administrador
**Dado** que Luis no es pastor ni administrador
**Cuando** el sistema evalua si Luis tiene el permiso completo
**Entonces** el sistema **debe** denegar el permiso
**Y** **no debe** otorgarlo por ninguna via automatica.

### ESC-05: trazabilidad-de-acceso
**Dado** que Pablo consulto un uno auno y una tríada bajo permiso completo
**Cuando** se consulta el registro de accesos pastorales
**Entonces** el sistema **debe** devolver dos entradas con el identificador de Pablo, el recurso accedido y la marca temporal.

### ESC-06: separacion-de-poderes
**Dado** que Pablo es pastor con permiso completo
**Cuando** se enumeran las acciones que Pablo puede ejecutar
**Entonces** la lista **debe** incluir lecturas pastorales completas
**Y** **no debe** incluir la validacion de pasos, la escritura de notas privadas en nombre de otros mentores, ni la cancelacion o disolucion de registros ajenos (P5).

### ESC-07: rechazo-de-cancelacion-ajena
**Dado** que Pablo es pastor con permiso completo pero no es mentor oficial de un uno auno
**Cuando** Pablo intenta cancelar o cerrar ese uno auno
**Entonces** el sistema **debe** rechazar la operacion
**Y** **debe** confirmar que el permiso completo no habilita acciones de escritura ajenas (P5).