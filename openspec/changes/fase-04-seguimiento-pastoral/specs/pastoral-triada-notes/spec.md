# Notas privadas de la tríada pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.triada.write_notes`
> **Estado del cambio:** propuesta

## Proposito

Las notas privadas de la tríada complementan el principio pastoral "dos vistas, una sola verdad" en el ambito de la tríada. El mentor oficial autor escribe lo que observa sobre el proceso de la persona acompanada, mientras los otros miembros de la tríada solo ven los hitos validados. Esta separacion respeta la dignidad de la conversacion pastoral y evita que las observaciones privadas se conviertan en datos compartidos sin discernimiento.

En la tríada por simultaneidad (P7), el coordinador del área entra como tercer actor pero **no ve** las notas privadas del líder de grupo de vida. La conversacion pastoral privada entre los dos líderes queda fuera de su circulo, y solo es accesible al pastor o administrador con `pastoral.read.all` en ultima instancia.

El sistema debe restringir la escritura de notas al mentor oficial autor y al pastor o administrador con permiso completo. Las notas son solo anexables: ninguna nota previa se modifica ni se elimina, y toda correccion se anexa como una nota nueva con trazabilidad completa.

## Requisitos

### REQ-01: autoria-del-mentor-o-permiso-completo
El sistema **debe** permitir escribir notas unicamente al mentor oficial autor de la tríada y al pastor o administrador con permiso completo.

### REQ-02: notas-solo-anexables
El sistema **debe** tratar las notas como anexables unicamente: ninguna nota previa puede modificarse ni eliminarse. Toda correccion se anexa como una nota nueva.

### REQ-03: sensibilidad-privada-con-exclusion-del-coordinador
El sistema **debe** marcar las notas como privadas en el mapa de sensibilidad, de modo que ninguna consulta agregada las incluya por defecto, ni siquiera para los otros miembros activos de la tríada, **incluido el coordinador del área en tríadas por simultaneidad** (P7). El coordinador del área nunca ve las notas privadas del líder de grupo de vida como mentor oficial autor.

### REQ-04: rechazo-a-otros-miembros
El sistema **debe** rechazar el intento de escribir notas por parte de la persona acompanada, del tercer actor sin ser mentor autor (incluido el coordinador del área), del director inmediato sin permiso completo, o de cualquier otro actor.

### REQ-05: trazabilidad-de-cada-nota
El sistema **debe** registrar el autor y la marca temporal de cada nota anexada, y **debe** conservar el historial completo de notas para el circulo autorizado.

### REQ-06: rechazo-pastoral-amigable
El sistema **debe** rechazar intentos no autorizados con un mensaje en lenguaje pastoral neutro.

## Escenarios

### ESC-01: escritura-feliz-por-el-mentor-autor
**Dado** que Carlos es el mentor oficial de la tríada de Ana
**Cuando** Carlos escribe una nota privada sobre la tríada
**Entonces** el sistema anexa la nota al registro de la tríada
**Y** registra a Carlos como autor y la marca temporal del acto.

### ESC-02: escritura-por-el-pastor-con-permiso-completo
**Dado** que Pablo es pastor con permiso completo
**Cuando** Pablo escribe una nota pastoral sobre la tríada
**Entonces** el sistema anexa la nota
**Y** registra a Pablo como autor.

### ESC-03: rechazo-al-tercer-actor-no-autor
**Dado** que Diana es el tercer actor de la tríada pero no es la mentora oficial
**Cuando** Diana intenta escribir una nota privada en la tríada
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que solo el mentor autor y el equipo pastoral pueden escribir notas privadas.

### ESC-04: rechazo-a-la-persona-acompanada
**Dado** que Ana es la persona acompanada de la tríada
**Cuando** Ana intenta escribir una nota privada
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** anexar contenido alguno.

### ESC-05: intento-de-modificacion-rechazado
**Dado** que Carlos escribio una nota previa sobre la tríada
**Cuando** Carlos intenta modificar esa nota
**Entonces** el sistema **debe** rechazar la modificacion
**Y** **debe** permitir solo anexar una nueva nota si lo desea.

### ESC-06: listado-agregado-de-tríadas-omite-las-notas
**Dado** que Carlos gestiona varias tríadas con notas privadas
**Cuando** Carlos consulta un listado agregado de sus tríadas
**Entonces** el sistema **no debe** incluir el contenido de las notas privadas
**Y** **debe** indicar unicamente cuantas notas existen para cada tríada.

### ESC-07: coordinador-no-ve-notas-del-lider
**Dado** que la tríada de Ana es de simultaneidad, con Carlos como mentor oficial autor de notas y Diana como coordinadora del área
**Cuando** Diana consulta las notas privadas de la tríada
**Entonces** el sistema **debe** devolver una respuesta agregada sin el contenido de las notas escritas por Carlos
**Y** **debe** indicar unicamente cuantas notas existen (P7)
**Y** la conversacion privada entre Carlos y el pastor o administrador con `pastoral.read.all` queda fuera del circulo de Diana.

### ESC-04: rechazo-a-la-persona-acompanada
**Dado** que Ana es la persona acompanada de la tríada
**Cuando** Ana intenta escribir una nota privada
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** anexar contenido alguno.

### ESC-05: intento-de-modificacion-rechazado
**Dado** que Carlos escribio una nota previa sobre la tríada
**Cuando** Carlos intenta modificar esa nota
**Entonces** el sistema **debe** rechazar la modificacion
**Y** **debe** permitir solo anexar una nueva nota si lo desea.

### ESC-06: listado-agregado-de-tríadas-omite-las-notas
**Dado** que Carlos gestiona varias tríadas con notas privadas
**Cuando** Carlos consulta un listado agregado de sus tríadas
**Entonces** el sistema **no debe** incluir el contenido de las notas privadas
**Y** **debe** indicar unicamente cuantas notas existen para cada tríada.