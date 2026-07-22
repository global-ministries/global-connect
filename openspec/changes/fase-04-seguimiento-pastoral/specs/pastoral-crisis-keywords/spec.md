# Deteccion de palabras clave de crisis pastoral

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Capacidad cubierta:** `pastoral.crisis.detect`
> **Estado del cambio:** propuesta

## Proposito

Cuando un lider registra notas durante un uno auno o al cerrar el encuentro, el sistema analiza el texto buscando palabras clave que sugieran una crisis pastoral seria (duelo, crisis matrimonial, ideacion suicida, violencia intrafamiliar, crisis de fe, entre otras). Si el sistema detecta una coincidencia, dispara una alerta automatica al pastor o al administrador con permiso completo, manteniendo la nota original del uno auno intacta y sin censura.

Esta capacidad traduce al diseno la decision pastoral P16, promovida al MVP para F4: el alertamiento automatico reemplaza la idea previa de que el mentor deba escalar manualmente al pastor o administrador.

## Requisitos

### REQ-01: analisis-al-cerrar-el-uno-auno
El sistema **debe** analizar el contenido del uno auno, especificamente el campo `resumen` acotado a quinientos caracteres y las notas privadas del mentor oficial autor, en el momento del cierre con estado `completado`, buscando coincidencias con el catalogo cerrado de palabras clave de crisis pastoral.

### REQ-02: catalogo-cerrado-y-configurable
El sistema **debe** mantener un catalogo cerrado de palabras clave de crisis pastoral agrupadas por categoria (`duelo`, `crisis_matrimonial`, `ideacion_suicida`, `violencia_intrafamiliar`, `crisis_de_fe`). El catalogo **debe** ser consultable y versionado, y **no debe** incluir contenido sensible profundo en si mismo: solo la lista de palabras y categorias.

### REQ-03: alerta-automatica-por-buzon-compartido
Cuando el sistema detecta una coincidencia, **debe** disparar una alerta automatica por el buzon compartido de Fase 3 con la plantilla `pastoral.crisis.alert.v1`. La alerta se dirige al pastor y al administrador con permiso completo (`pastoral.read.all`); el lider autor de la nota la ve **ademas** en su propio buzon, con el mismo nivel de sensibilidad.

### REQ-04: nota-original-intacta
El sistema **no debe** modificar, borrar ni censurar el contenido del resumen ni de las notas del mentor oficial autor al detectar la coincidencia. La alerta es adicional; no reemplaza ni altera el registro pastoral subyacente.

### REQ-05: sensibilidad-y-privacidad
La alerta generada **debe** marcarse con sensibilidad alta. Solo el pastor o administrador con permiso completo la ven junto al lider autor; los demas miembros del circulo pastoral **no** la ven.

### REQ-06: evento-pastoral-auditable
El sistema **debe** registrar cada deteccion de palabra clave como evento pastoral en el libro mayor compartido de Fase 3, con `kind` igual a `pastoral_crisis_detected`, la referencia al `one_on_one_id`, la categoria detectada y el actor que cerro el uno auno. El evento **debe** ser inmutable y auditable por el pastor con `pastoral.read.all`.

## Escenarios

### ESC-01: coincidencia-detectada-y-alerta-enviada
**Dado** que el lider Carlos cierra un uno auno con un resumen que contiene una palabra del catalogo de duelo
**Cuando** el sistema analiza el contenido del uno auno
**Entonces** dispara una alerta al pastor y al administrador por el buzon compartido con la plantilla `pastoral.crisis.alert.v1`
**Y** registra el evento pastoral inmutable `pastoral_crisis_detected` con la categoria `duelo`.

### ESC-02: sin-coincidencia
**Dado** que el lider Carlos cierra un uno auno cuyo resumen y notas no contienen palabras clave
**Cuando** el sistema analiza el contenido del uno auno
**Entonces** **no debe** disparar ninguna alerta
**Y** registra el cierre normal del uno auno sin evento de crisis.

### ESC-03: nota-original-inalterada
**Dado** que un uno auno contiene una palabra clave de crisis en su resumen
**Cuando** el sistema la analiza
**Entonces** la nota original **debe** quedar intacta en el registro pastoral del uno auno
**Y** **no debe** aparecer ningun contenido censurado en el lugar de la coincidencia.

### ESC-04: pareja-con-uno-auno-y-palabra-clave
**Dado** que Ana y Luis son pareja con un uno auno compartido que cierra con una palabra clave de crisis
**Cuando** el sistema analiza el contenido
**Entonces** **debe** disparar una sola alerta, no dos, referenciando a ambos participantes del uno auno
**Y** **debe** registrar un solo evento `pastoral_crisis_detected` para el registro compartido (P8).

### ESC-05: palabra-en-nota-privada-pero-no-en-resumen
**Dado** que la nota privada del mentor oficial autor contiene una palabra clave del catalogo, y el resumen no la contiene
**Cuando** el sistema analiza ambos campos
**Entonces** **debe** disparar la alerta igual
**Y** la busqueda cubre tanto `resumen` como las notas privadas del mentor oficial autor en el mismo barrido.

### ESC-06: evento-auditable-con-categoria
**Dado** que se detecto una coincidencia de categoria `crisis_matrimonial`
**Cuando** el sistema registra el evento pastoral
**Entonces** el `kind` **debe** ser `pastoral_crisis_detected` y el dato de categoria **debe** quedar registrado en el evento como `categoria='crisis_matrimonial'`
**Y** el evento **debe** ser consultable por el pastor o administrador con `pastoral.read.all` desde el libro mayor compartido.
