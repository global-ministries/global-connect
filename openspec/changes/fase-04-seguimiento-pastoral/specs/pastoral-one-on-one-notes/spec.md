# Notas privadas del uno a uno pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.one_on_one.write_notes`
> **Estado del cambio:** propuesta

## Proposito

Las notas privadas del mentor son el corazon del principio pastoral "dos vistas, una sola verdad". Existen para que el lider pueda registrar lo que observa sin que la persona acompanada vea esas observaciones en su propia vista publica. Esta separacion no es una conveniencia tecnica: es una decision pastoral explicita.

El sistema debe restringir la escritura de notas al mentor que creo el uno auno y al pastor o administrador con permiso completo. Las notas son solo anexables: ninguna nota se modifica ni se elimina. Ademas, el sistema debe marcarlas con una sensibilidad especial para que **ningun listado agregado** las incluya por accidente, ni siquiera cuando el solicitante sea un director inmediato del area.

## Requisitos

### REQ-01: autoria-del-mentor
El sistema **debe** permitir escribir notas unicamente al mentor que creo el uno auno y al pastor o administrador con permiso completo.

### REQ-02: notas-solo-anexables
El sistema **debe** tratar las notas como anexables unicamente: ninguna nota previa puede modificarse ni eliminarse. Toda correccion se anexa como una nota nueva.

### REQ-03: sensibilidad-privada
El sistema **debe** marcar las notas como privadas en el mapa de sensibilidad, de modo que **ninguna consulta agregada** las incluya por defecto.

### REQ-04: rechazo-a-otros-actores
El sistema **debe** rechazar el intento de escribir notas por parte de la persona acompanada, otros miembros de la tríada, el director inmediato sin permiso completo, o cualquier otro actor.

### REQ-05: trazabilidad-de-cada-nota
El sistema **debe** registrar el autor y la marca temporal de cada nota anexada, y **debe** conservar el historial completo de notas para el circulo autorizado.

### REQ-06: rechazo-pastoral-amigable
El sistema **debe** rechazar intentos no autorizados con un mensaje en lenguaje pastoral neutro, evitando jerga tecnica.

## Escenarios

### ESC-01: escritura-feliz-por-el-mentor
**Dado** que Carlos es el mentor que creo el uno auno con Ana
**Cuando** Carlos escribe una nota privada sobre el acompanamiento
**Entonces** el sistema anexa la nota al registro del uno auno
**Y** registra a Carlos como autor y la marca temporal del acto.

### ESC-02: escritura-por-el-pastor-con-permiso-completo
**Dado** que Pablo es pastor con permiso completo
**Cuando** Pablo escribe una nota pastoral sobre el uno auno de Ana
**Entonces** el sistema anexa la nota
**Y** registra a Pablo como autor.

### ESC-03: rechazo-a-la-persona-acompanada
**Dado** que Ana es la persona acompanada del uno auno
**Cuando** Ana intenta escribir una nota privada
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que solo el mentor y el equipo pastoral pueden registrar notas privadas.

### ESC-04: rechazo-al-director-inmediato
**Dado** que Diana es directora inmediata del area de Carlos
**Cuando** Diana intenta escribir una nota privada en el uno auno de Carlos
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** anexar contenido alguno.

### ESC-05: intento-de-modificacion-rechazado
**Dado** que Carlos escribio una nota previa sobre el uno auno
**Cuando** Carlos intenta modificar esa nota
**Entonces** el sistema **debe** rechazar la modificacion
**Y** **debe** permitir solo anexar una nueva nota si lo desea.

### ESC-06: listado-agregado-omite-las-notas
**Dado** que Carlos tiene varios unos auno con notas privadas
**Cuando** Carlos consulta un listado agregado de sus unos auno
**Entonces** el sistema **no debe** incluir el contenido de las notas privadas
**Y** **debe** indicar unicamente cuantos notas existen para cada uno auno.