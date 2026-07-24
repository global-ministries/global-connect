# Metricas pastorales basicas

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permisos cubiertos:** `pastoral.metrics.read`, `pastoral.read.all`
> **Estado del cambio:** propuesta

## Proposito

Las metricas pastorales basicas existen para alimentar conversaciones del equipo pastoral con datos simples, sin caer en analitica avanzada ni en tableros publicos. Su proposito es detectar descuidos pastorales (personas sin acompanamiento durante mucho tiempo, unos auno que no se cierran, tríadas inactivas), no publicar rendimiento pastoral.

El sistema expone cuatro funciones puras en el MVP, alineadas con el patron de metricas base de Fase 2. Las metricas se muestran como **tarjetas simples en el dashboard del lider y del pastor**: la pagina dedicada de metricas queda como tarea de fase futura, fuera del MVP. Los resultados **solo** son accesibles al lider habilitado y al pastor o administrador con permiso completo; **no** se exponen en tablero publico.

## Requisitos

### REQ-01: cuatro-tarjetas-sencillas-en-el-dashboard
El sistema **debe** exponer cuatro funciones puras y mostrarlas como tarjetas sencillas en el dashboard del lider y del pastor, sin pagina dedicada en el MVP: `uno_auno_por_periodo`, `lideres_activos_por_ventana`, `triadas_por_tipo`, `alarma_gdv_sin_uno_auno_en_90_dias`. Una pagina dedicada queda como tarea de fase futura.

### REQ-02: conteo-de-uno-auno-por-periodo
El sistema **debe** calcular `uno_auno_por_periodo` indicando cuantos 1:1 se programaron y cuantos se cerraron en la ventana de tiempo elegida (mes o trimestre).

### REQ-03: ranking-de-lideres-mas-activos
El sistema **debe** calcular `lideres_activos_por_ventana` como un ranking simple de los lideres con mas 1:1 cerrados en la ventana, sin comparacion porcentual ni metas duras.

### REQ-04: distribucion-de-tríadas-por-tipo
El sistema **debe** calcular `triadas_por_tipo` distinguiendo entre tríadas surgidas por `nuevo_paso` y tríadas surgidas por `simultaneidad`, para que el pastor pueda ver el peso de cada contexto pastoral.

### REQ-05: alarma-de-grupo-de-vida-sin-uno-auno
El sistema **debe** calcular `alarma_gdv_sin_uno_auno_en_90_dias`, listando personas en grupo de vida activo que no tienen un 1:1 cerrado en los ultimos noventa dias. La alarma se entrega al lider del grupo de vida correspondiente. Esta es la unica alerta pastoral del MVP: no se reabre P12 con metas duras ni porcentajes.

### REQ-06: acceso-restringido-a-lideres-y-pastor
El sistema **debe** restringir el acceso a las metricas pastorales unicamente a lideres habilitados y al pastor o administrador con permiso completo. **No debe** existir un tablero publico con estas metricas.

## Escenarios

### ESC-01: consulta-de-conteo-por-periodo
**Dado** que en el ultimo trimestre se programaron diez 1:1 y se cerraron ocho
**Cuando** se invoca la funcion `uno_auno_por_periodo`
**Entonces** el sistema devuelve ambos conteos en la tarjeta del dashboard, sin pagina dedicada.

### ESC-02: ranking-de-lideres-mas-activos
**Dado** que Carlos cerro cinco 1:1 en la ventana y Diana cerro tres
**Cuando** se invoca la funcion `lideres_activos_por_ventana`
**Entonces** el sistema devuelve un ranking simple con Carlos primero y Diana despues
**Y** **no debe** mostrar porcentajes ni metas duras.

### ESC-03: alarma-de-grupo-de-vida-sin-uno-auno
**Dado** que Ana esta en grupo de vida activo y no tiene un 1:1 cerrado en los ultimos noventa dias
**Cuando** se calcula `alarma_gdv_sin_uno_auno_en_90_dias`
**Entonces** el sistema **debe** marcar a Ana como caso a atender
**Y** **debe** entregar la alarma al lider del grupo de vida de Ana.

### ESC-04: distribucion-de-tríadas-por-tipo
**Dado** que existen cuatro tríadas activas: tres por nuevo paso y una por simultaneidad
**Cuando** se invoca la funcion `triadas_por_tipo`
**Entonces** el sistema devuelve el desglose por tipo en la tarjeta
**Y** **debe** permitir identificar el peso de cada contexto pastoral.

### ESC-05: rechazo-de-alertas-no-pastorales-en-el-MVP
**Dado** que en el MVP no hay alertas de tiempo mediano, porcentajes ni metas duras (no se reabre P12)
**Cuando** el pastor consulta las tarjetas del dashboard
**Entonces** el sistema **debe** mostrar unicamente las cuatro tarjetas definidas en REQ-01
**Y** **no debe** mostrar tarjetas adicionales en el MVP.

### ESC-06: rechazo-de-acceso-publico
**Dado** que Luis no es lider habilitado ni pastor ni administrador
**Cuando** Luis intenta consultar cualquiera de las metricas pastorales
**Entonces** el sistema **debe** rechazar la operacion
**Y** **no debe** entregar valores numericos de metricas pastorales.