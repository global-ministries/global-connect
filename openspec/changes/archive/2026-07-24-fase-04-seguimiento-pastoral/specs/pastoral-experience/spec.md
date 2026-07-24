# Experiencia pastoral y catalogo de permisos

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permisos cubiertos:** `pastoral.one_on_one.*`, `pastoral.triada.*`, `pastoral.read.all`, `pastoral.mentor.cascade.resolve`, `pastoral.crisis.detect`
> **Estado del cambio:** propuesta

## Proposito

Fase 4 introduce la experiencia pastoral como un ambito propio dentro del catalogo de experiencias de la plataforma. Esta decision refleja el principio pastoral de que el acompanamiento no es un modulo mas: tiene su propio idioma, su propia visibilidad y sus propias reglas de validacion. La nueva experiencia convive con las existentes (grupos de vida, the living room, dream team) sin reemplazarlas ni absorberlas.

El sistema declara la experiencia pastoral y los tipos de alcance asociados de forma puramente aditiva. Ningun archivo protegido de fases anteriores se modifica: la experiencia se anade como una entrada nueva en el catalogo, y cada permiso pastoral se registra como una entrada independiente, siguiendo el precedente de Fase 2 cuando incorporo `dream_team` como experiencia nueva.

## Requisitos

### REQ-01: declaracion-aditiva-de-experiencia
El sistema **debe** anadir `experience = 'pastoral'` al catalogo de experiencias como una entrada nueva, sin modificar las entradas ya existentes.

### REQ-02: tipos-de-alcance-pastorales
El sistema **debe** declarar dos tipos de alcance nuevos asociados a la experiencia pastoral: `one_on_one` y `triada`. Ningun otro tipo de alcance **debe** reutilizar estos identificadores.

### REQ-03: catalogo-de-permisos-pastorales
El sistema **debe** registrar cada permiso pastoral nuevo como una entrada independiente en el catalogo, indicando su tipo de alcance (`one_on_one`, `triada`, `experiencia pastoral` o `experiencia`) y su descripcion pastoral en lenguaje neutro. El catalogo **debe** incluir la capacidad `pastoral.crisis.detect` (P16), responsable de detectar palabras clave de crisis pastoral al cierre del 1:1 y emitir la alerta correspondiente.

### REQ-04: helper-de-resolucion-pastoral
El sistema **debe** ofrecer una funcion pura que, dado un permiso pastoral y el contexto de sesion del solicitante, devuelva un veredicto claro de autorizado o denegado. La funcion **debe** ser invocable desde el lado del servidor en cualquier flujo pastoral.

### REQ-05: ninguna-modificacion-de-archivos-protegidos
El sistema **no debe** modificar el catalogo de experiencias preexistente, los tipos de alcance existentes, ni los modulos protegidos de fases previas. Toda adicion **debe** ser puramente aditiva y detectable por diferencia de archivos.

### REQ-06: idioma-y-tono-pastorales
El sistema **debe** usar lenguaje pastoral-amigable en las superficies visibles para las personas acompanadas. Los mensajes de error visibles al publico **deben** evitar jerga tecnica y mantener dignidad pastoral.

## Escenarios

### ESC-01: alta-aditiva-de-experiencia
**Dado** que el catalogo actual contiene las experiencias de Fase 1, Fase 2 y Fase 3
**Cuando** el operador consulta el catalogo tras desplegar Fase 4
**Entonces** las entradas existentes aparecen sin cambios
**Y** la entrada `pastoral` aparece visible como experiencia adicional.

### ESC-02: rechazo-de-modificacion-de-existente
**Dado** que la experiencia `grupos_vida` tiene un conjunto propio de permisos
**Cuando** un cambio intenta asignar permisos pastorales bajo `grupos_vida`
**Entonces** el sistema **debe** rechazar el intento
**Y** el permiso pastoral **debe** quedar registrado exclusivamente bajo la experiencia pastoral.

### ESC-03: tipos-de-alcance-disponibles
**Dado** que la experiencia pastoral esta registrada
**Cuando** el sistema evalua un permiso pastoral
**Entonces** el tipo de alcance **debe** ser exactamente uno de los declarados: `one_on_one`, `triada` o `experiencia pastoral`.

### ESC-04: helper-invocable-desde-el-servidor
**Dado** que un flujo pastoral debe verificar si el solicitante tiene permiso `pastoral.one_on_one.read`
**Cuando** el sistema invoca el helper de resolucion con el contexto de sesion
**Entonces** el helper **debe** devolver un veredicto claro de autorizado o denegado, basado en los permisos otorgados al solicitante.

### ESC-05: mensaje-pastoral-amigable
**Dado** que una persona acompanada intenta ver una nota privada del mentor desde la vista publica
**Cuando** el sistema rechaza el acceso
**Entonces** el mensaje devuelto **debe** estar redactado con tono pastoral, indicando que la informacion es privada entre su lider y el equipo pastoral.

### ESC-06: byte-identidad-de-protegidos
**Dado** que los archivos protegidos de fases previas no se tocan
**Cuando** se comparan byte a byte los archivos protegidos entre la version anterior y la posterior a Fase 4
**Entonces** la diferencia **debe** ser nula.

### ESC-07: capacidad-de-deteccion-de-crisis
**Dado** que el catalogo de permisos pastorales esta cargado
**Cuando** se consulta la entrada `pastoral.crisis.detect`
**Entonces** el sistema **debe** retornarla como capacidad pastoral valida
**Y** su tipo de alcance **debe** ser `experiencia pastoral`.