# Puente pastoral con el nucleo operativo

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permisos cubiertos:** todos los permisos pastorales declarados en este cambio
> **Estado del cambio:** propuesta

## Proposito

El puente pastoral con el nucleo operativo traduce la decision arquitectonica de Fase 4 a sus cuatro reusos concretos: la misma tabla longitudinal de eventos participativos, el mismo buzon de notificaciones, el mismo helper de permisos pastorales, y la misma regla de no-tocar-los-modulos-protegidos. Sin este puente explicito, Fase 4 corre el riesgo de reinventar lo que Fase 3 ya construyo, multiplicando la superficie a mantener.

El sistema reusa los modulos de Fase 3 sin editarlos, expone los eventos pastorales con el prefijo `pastoral_` para mantener el namespace limpio, y delega la entrega de notificaciones al buzon compartido. Ningun modulo protegido de Fase 1, Fase 2 o Fase 3 puede modificarse como parte de este cambio.

## Requisitos

### REQ-01: reuso-de-tabla-longitudinal-de-fase-3
El sistema **debe** escribir los eventos pastorales en la misma tabla longitudinal de eventos participativos que usa Fase 3, sin crear una tabla pastoral paralela.

### REQ-02: prefijo-pastoral-en-los-tipos-de-evento
El sistema **debe** nombrar los tipos de evento pastorales con el prefijo `pastoral_`, manteniendo el namespace separado de los tipos de evento operacionales de Fase 3.

### REQ-03: reuso-del-buzon-compartido
El sistema **debe** entregar las notificaciones pastorales usando el buzon compartido de Fase 3, con plantillas versionadas con prefijo `pastoral.`.

### REQ-04: reuso-del-helper-de-permisos
El sistema **debe** evaluar los permisos pastorales usando un helper de resolucion con la misma forma que el helper de Fase 3 para permisos operacionales.

### REQ-05: ninguna-modificacion-de-modulos-protegidos
El sistema **no debe** modificar los modulos protegidos de Fase 1, Fase 2 o Fase 3. La adicion **debe** limitarse a un modulo hermano pastoral y a una extension aditiva del esquema.

### REQ-06: trazabilidad-del-reuso
El sistema **debe** permitir verificar que el reuso es completo: cualquier evento pastoral debe poder rastrearse hasta el buzon compartido, hasta el helper de permisos y hasta la tabla longitudinal.

## Escenarios

### ESC-01: escritura-de-evento-pastoral-en-tabla-compartida
**Dado** que Carlos valido un paso espiritual para Ana
**Cuando** se persiste la validacion
**Entonces** el sistema escribe una fila en la tabla longitudinal con el tipo de evento con prefijo `pastoral_`
**Y** la fila contiene los datos del mentor, del uno auno y del paso.

### ESC-02: entrega-de-notificacion-por-buzon-compartido
**Dado** que se emitio una notificacion pastoral por completitud de un uno auno
**Cuando** se inspecciona el mecanismo de entrega
**Entonces** **debe** haber pasado por el buzon compartido de Fase 3
**Y** la plantilla usada **debe** tener el prefijo `pastoral.`.

### ESC-03: evaluacion-de-permiso-por-helper-compartido
**Dado** que un flujo pastoral verifica el permiso de un actor
**Cuando** se inspecciona el mecanismo de evaluacion
**Entonces** el helper invocado **debe** tener la misma forma que el helper de Fase 3 para permisos operacionales
**Y** **no debe** duplicarse la logica de evaluacion.

### ESC-04: verificacion-de-modulos-protegidos
**Dado** que el cambio de Fase 4 esta aplicado
**Cuando** se comparan byte a byte los modulos protegidos de Fase 1, Fase 2 y Fase 3 contra la version previa
**Entonces** la diferencia **debe** ser nula para todos los modulos protegidos.

### ESC-05: rechazo-de-tabla-pastoral-paralela
**Dado** que los eventos pastorales estan implementados
**Cuando** se inspecciona el esquema
**Entonces** **no debe** existir una tabla paralela que duplique la tabla longitudinal de Fase 3
**Y** toda escritura pastoral **debe** ir a la tabla compartida.

### ESC-06: trazabilidad-completa-del-reuso
**Dado** que se emitio un evento pastoral completo
**Cuando** se sigue la cadena desde el evento hasta la entrega
**Entonces** el evento **debe** localizarse en la tabla longitudinal
**Y** la notificacion derivada **debe** localizarse en el buzon compartido
**Y** la evaluacion del permiso del actor **debe** haber pasado por el helper pastoral.