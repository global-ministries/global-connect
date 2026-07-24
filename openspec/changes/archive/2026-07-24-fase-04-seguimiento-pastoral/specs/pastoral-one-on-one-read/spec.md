# Leer uno a uno pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.one_on_one.read`
> **Estado del cambio:** propuesta

## Proposito

La lectura del uno a uno pastoral refleja los circulos de visibilidad que el principio pastoral exige y las decisiones P5 y P6. **La persona acompanada solo ve el roadmap agregado** (fechas, hitos validados, proximo paso sugerido); **nunca** ve notas privadas del mentor ni detalles pastorales. El lider creador ve su propio uno auno completo. El director inmediato del area ve los unos auno de su equipo en formato agregado. El pastor o administrador con permiso completo ve todo, incluidas las notas privadas, pero no valida pasos (P5).

El sistema entrega datos en formato agregado por defecto y **nunca debe** filtrar notas privadas del mentor en listados que no correspondan al circulo autorizado. Esto blinda el principio pastoral "no exponer lo sagrado como dato" desde el diseno, no como parche posterior.

## Requisitos

### REQ-01: tres-circulos-de-visibilidad
El sistema **debe** reconocer tres circulos de lectura del uno auno: la persona acompanada (solo el roadmap agregado, P6), el equipo pastoral autorizado (datos agregados o detalles segun rol), y el permiso completo del pastor o administrador (incluye notas privadas pero no habilita validar pasos, P5).

### REQ-02: persona-solo-roadmap-agregado
El sistema **debe** entregar a la persona acompanada unicamente el roadmap agregado del uno auno (fechas, hitos validados, proximo paso sugerido) y **no debe** entregar notas privadas del mentor ni detalles pastorales (P6).

### REQ-03: omision-de-notas-privadas
El sistema **no debe** incluir notas privadas del mentor en la respuesta entregada a un solicitante que no sea el mentor autor o quien posea el permiso completo del pastor o administrador.

### REQ-04: visibilidad-para-el-lider-creador
El sistema **debe** permitir al lider que creo el uno auno leer el registro completo que el mismo abrio.

### REQ-05: visibilidad-para-el-director-inmediato
El sistema **debe** permitir al director inmediato del area leer los unos auno de su equipo en formato agregado, sin notas privadas y sin capacidad de validar pasos.

### REQ-06: hito-compartido-de-grupo-de-matrimonio
El sistema **debe** proyectar en el roadmap de la persona acompanada los hitos generados por grupos de matrimonio cuando el uno auno es de pareja; los hitos individuales se mantienen por persona y **no** se proyectan cruzados (P9).

### REQ-07: rechazo-pastoral-amigable
El sistema **debe** rechazar solicitudes de lectura fuera de los circulos autorizados con un mensaje en lenguaje pastoral neutro que indique que la informacion no corresponde a su circulo.

## Escenarios

### ESC-01: lectura-por-la-persona-acompanada
**Dado** que Ana es la persona acompanada de un uno auno registrado
**Cuando** Ana consulta su propio uno auno desde la vista publica
**Entonces** el sistema devuelve unicamente el roadmap agregado del uno auno (fechas, mentor, estado, hitos validados, proximo paso sugerido)
**Y** **no debe** incluir las notas privadas del mentor ni detalles pastorales (P6).

### ESC-02: lectura-por-el-lider-creador
**Dado** que Carlos es el lider que creo el uno auno con Ana
**Cuando** Carlos consulta el registro
**Entonces** el sistema devuelve el contenido completo del uno auno que el mismo abrio
**Y** las notas privadas que Carlos escribio quedan visibles.

### ESC-03: lectura-por-el-director-inmediato
**Dado** que Diana es la directora inmediata del area donde sirve Carlos
**Cuando** Diana consulta el uno auno que Carlos abrio con Ana
**Entonces** el sistema devuelve los datos agregados del uno auno
**Y** **no debe** incluir las notas privadas de Carlos.

### ESC-04: lectura-con-permiso-completo-del-pastor
**Dado** que Pablo es pastor y tiene el permiso completo del pastor o administrador
**Cuando** Pablo consulta cualquier uno auno
**Entonces** el sistema devuelve el contenido completo, incluidas las notas privadas del mentor autor
**Y** este permiso **no** le habilita a validar pasos (P5).

### ESC-05: rechazo-de-actor-fuera-de-circulo
**Dado** que Pedro no es la persona acompanada, ni el lider creador, ni el director inmediato, ni pastor con permiso completo
**Cuando** Pedro intenta leer el uno auno de Ana
**Entonces** el sistema **debe** rechazar la operacion
**Y** el mensaje devuelto **debe** indicar que la informacion no corresponde a su circulo pastoral.

### ESC-06: listado-agregado-sin-notas
**Dado** que Carlos tiene multiples unos auno abiertos
**Cuando** Carlos consulta su listado general
**Entonces** el sistema devuelve un resumen por uno auno (estado, asistidos, fecha, mentor)
**Y** **no debe** incluir el contenido de las notas privadas en el listado.

### ESC-07: hito-de-matrimonio-compartido
**Dado** que Ana y Luis son una pareja con un uno auno compartido
**Y** existe un hito generado por un grupo de matrimonio
**Cuando** Ana consulta su roadmap desde la vista publica
**Entonces** el sistema **debe** proyectar el hito de matrimonio en su roadmap
**Y** **no debe** proyectar hitos individuales de Luis en el roadmap de Ana (P9).