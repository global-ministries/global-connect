# Leer tríada pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.triada.read`
> **Estado del cambio:** propuesta

## Proposito

La lectura de la tríada respeta el principio pastoral "dos vistas, una sola verdad", con cuatro circulos de visibilidad definidos por la decision pastoral P6 y la decision P7:

- La persona acompanada ve **solo el roadmap agregado** del 1:1 y su tríada como vista publica (sin notas privadas).
- Los miembros de la tríada ven hitos validados y composicion, **nunca notas privadas del mentor oficial autor**.
- El director inmediato del area ve la tríada en formato agregado, sin notas privadas.
- El pastor o administrador con permiso completo (`pastoral.read.all`) ve todo, incluidas las notas privadas, **pero este permiso no le habilita a validar pasos** (decision P5).

En la tríada por simultaneidad (P7), el coordinador del área entra como tercer actor. El coordinador **no ve** las notas privadas que el líder de grupo de vida escribió como mentor oficial autor: solo ve los hitos validados y el roadmap agregado. La conversacion pastoral privada entre los dos líderes queda fuera de su circulo.

El sistema entrega datos en formato agregado por defecto y debe omitir cualquier contenido marcado como privado en los listados que no correspondan al circulo autorizado. Esto blinda el principio pastoral desde el diseno, no como parche posterior.

## Requisitos

### REQ-01: cuatro-circulos-de-visibilidad
El sistema **debe** reconocer cuatro circulos de lectura de la tríada: la persona acompanada (solo roadmap agregado, P6), los miembros de la tríada (composicion y hitos validados), el director inmediato del area (formato agregado), y el permiso completo del pastor o administrador (lectura completa sin capacidad de validar pasos, P5).

### REQ-02: persona-acompanada-solo-roadmap-agregado
El sistema **debe** entregar a la persona acompanada unicamente el roadmap agregado de la tríada (composicion publica, hitos validados) y **no debe** entregar notas privadas del mentor oficial autor (P6).

### REQ-03: omision-de-notas-privadas-para-tercer-actor
El sistema **no debe** incluir notas privadas del mentor oficial autor en la respuesta entregada a otro miembro de la tríada, al lider creador sin ser mentor autor, al director inmediato, ni al coordinador del área en tríadas por simultaneidad (P7). El coordinador del área es un miembro mas a efectos de lectura de notas privadas: solo ve hitos y roadmap agregado.

### REQ-04: visibilidad-para-los-miembros
El sistema **debe** permitir a cada miembro activo de la tríada leer la composicion de la tríada y los hitos validados, pero no las notas privadas del mentor autor.

### REQ-05: visibilidad-para-el-director-inmediato
El sistema **debe** permitir al director inmediato del area leer las tríadas de su equipo en formato agregado, sin notas privadas.

### REQ-06: rechazo-pastoral-amigable
El sistema **debe** rechazar solicitudes de lectura fuera de los circulos autorizados con un mensaje en lenguaje pastoral neutro.

## Escenarios

### ESC-01: lectura-por-un-miembro-de-la-tríada
**Dado** que Diana es el tercer actor de la tríada de Ana
**Cuando** Diana consulta la tríada
**Entonces** el sistema devuelve la composicion de la tríada y los hitos validados
**Y** **no debe** incluir las notas privadas que Carlos escribio como mentor autor.

### ESC-02: coordinador-en-simultaneidad-sin-notas-del-lider
**Dado** que la tríada de Ana es de simultaneidad, con Carlos como mentor oficial autor y Diana como coordinadora del área
**Cuando** Diana consulta la tríada
**Entonces** el sistema devuelve la composicion, el roadmap agregado y los hitos validados
**Y** **no debe** incluir las notas privadas escritas por Carlos como mentor oficial autor (P7)
**Y** la conversacion pastoral privada entre Carlos y el pastor o administrador con `pastoral.read.all` queda fuera del circulo de Diana.

### ESC-03: lectura-por-el-mentor-autor
**Dado** que Carlos es el mentor oficial de la tríada y autor de las notas privadas
**Cuando** Carlos consulta la tríada
**Entonces** el sistema devuelve el contenido completo de la tríada
**Y** las notas privadas que el mismo escribio quedan visibles
**Y** **ningun otro miembro** de la tríada las ve en su consulta agregada.

### ESC-04: lectura-por-el-director-inmediato
**Dado** que Pablo es director inmediato del area donde se formo la tríada
**Cuando** Pablo consulta la tríada
**Entonces** el sistema devuelve los datos agregados
**Y** **no debe** incluir las notas privadas del mentor autor.

### ESC-05: lectura-con-permiso-completo
**Dado** que Pablo es pastor con permiso completo del pastor o administrador
**Cuando** Pablo consulta cualquier tríada
**Entonces** el sistema devuelve el contenido completo, incluidas las notas privadas del mentor autor.

### ESC-06: rechazo-de-actor-fuera-de-circulo
**Dado** que Luis no es miembro de la tríada ni lider creador ni director inmediato ni pastor con permiso completo
**Cuando** Luis intenta leer la tríada
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que la informacion no corresponde a su circulo.

### ESC-07: listado-agregado-sin-notas
**Dado** que Carlos gestiona varias tríadas
**Cuando** Carlos consulta su listado general
**Entonces** el sistema devuelve un resumen por tríada (estado, miembros, tipo)
**Y** **no debe** incluir el contenido de las notas privadas en el listado.