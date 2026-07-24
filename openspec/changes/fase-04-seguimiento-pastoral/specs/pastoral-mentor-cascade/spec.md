# Resolucion del mentor oficial por cascada

> **Cambio SDD:** `fase-04-seguimiento-pastoral`
> **Permiso cubierto:** `pastoral.mentor.cascade.resolve`
> **Estado del cambio:** propuesta

## Proposito

La decision pastoral "el sistema sugiere, el mentor valida" necesita un mecanismo concreto para proponer al mentor oficial de una persona. La cascada resuelve esa propuesta con una regla simple: el grupo de vida pesa mas que cualquier otro rol. Si la persona esta en un grupo de vida activo por temporada activa (decision P1), su lider de grupo es su mentor oficial; si no, pero asiste a un taller de corto plazo, su lider de taller es su mentor oficial; si no, pero sirve en un equipo, su lider de servicio es su mentor oficial.

La asignacion resultante es **automatica** y la persona **no puede rechazarla** (decisiones P2 y P3). La iglesia asigna; el asistido ora y acompaña. Si la persona no pertence a grupo de vida, ni a taller, ni a servicio, la cascada devuelve un resultado explicito de ausencia de candidato y el sistema **no debe** proponer un lider por defecto (decision P14).

El sistema expone esta resolucion como una funcion pura, sin estado, sin acceso directo al exterior y sin dependencias de modulos protegidos. La funcion toma el identificador de una persona y devuelve el identificador de su mentor oficial propuesto, o un resultado explicito cuando la cascada no produce un candidato valido.

## Requisitos

### REQ-01: prioridad-del-grupo-de-vida-unico-y-activo
El sistema **debe** preferir el lider del grupo de vida activo por temporada activa de la persona por sobre cualquier otro candidato (P1). Si la persona asiste a un grupo de vida activo, ese lider es el mentor oficial propuesto, aunque la persona tambien sirva en un area o este en otro programa. Una persona solo puede estar en un grupo de vida activo por temporada activa; grupos de vida inactivos o temporadas pasadas **no** cuentan.

### REQ-02: segundo-nivel-taller
Si la persona no esta en grupo de vida activo pero asiste a un taller de corto plazo, el sistema **debe** proponer como mentor oficial al lider de ese taller.

### REQ-03: tercer-nivel-servicio
Si la persona no esta en grupo de vida activo ni en taller pero sirve en un equipo, el sistema **debe** proponer como mentor oficial al coordinador o director de ese servicio.

### REQ-04: asignacion-automatica-y-sin-rechazo
El sistema **debe** entregar el mentor oficial resultante de la cascada de forma automatica, sin solicitar confirmacion explicita del lider (P2) y sin ofrecer a la persona acompanada una opcion de rechazo (P3). La iglesia asigna; el asistido ora y acompaña.

### REQ-05: resultado-explicito-cuando-no-hay-candidato
El sistema **debe** devolver un resultado explicito cuando la persona no pertence a grupo de vida activo, ni a taller, ni a servicio (P14), y por lo tanto la cascada no produce un candidato valido. En ese caso el sistema **no debe** proponer un lider por defecto y la persona **no tiene mentor oficial**.

### REQ-06: pureza-de-la-funcion
El sistema **debe** ofrecer la resolucion como una funcion pura llamada `resolverMentorOficial`, deterministica, sin efectos colaterales, sin acceso a red ni a disco, testeable con datos en memoria. Una persona solo en grupo de vida activo (P1) hace innecesaria una regla de desempate por doble grupo de vida en el MVP.

## Escenarios

### ESC-01: resolucion-por-grupo-de-vida-que-pesa-mas
**Dado** que Ana asiste al grupo de vida de Carlos
**Y** Ana ademas sirve en el equipo de Diana
**Cuando** se invoca la funcion pura con el identificador de Ana
**Entonces** el sistema devuelve el identificador de Carlos como mentor oficial propuesto.

### ESC-02: resolucion-por-taller-cuando-no-hay-grupo-de-vida
**Dado** que Ana no esta en grupo de vida
**Y** Ana asiste al taller de Luis
**Cuando** se invoca la funcion pura con el identificador de Ana
**Entonces** el sistema devuelve el identificador de Luis como mentor oficial propuesto.

### ESC-03: resolucion-por-servicio-cuando-no-hay-grupo-ni-taller
**Dado** que Ana no esta en grupo de vida ni en taller
**Y** Ana sirve en el equipo de Pablo
**Cuando** se invoca la funcion pura con el identificador de Ana
**Entonces** el sistema devuelve el identificador de Pablo como mentor oficial propuesto.

### ESC-04: resultado-explicito-sin-candidato
**Dado** que Ana no pertence a grupo de vida activo, ni a taller, ni a servicio
**Cuando** se invoca la funcion pura con el identificador de Ana
**Entonces** el sistema devuelve un resultado explicito de ausencia de candidato
**Y** **no debe** proponer un lider por defecto
**Y** Ana no tiene mentor oficial mientras esa condicion se mantenga (P14).

### ESC-05: pureza-de-la-funcion
**Dado** que la funcion pura es invocada dos veces seguidas con el mismo identificador de persona y los mismos datos
**Cuando** se comparan los resultados
**Entonces** ambos resultados **deben** ser identicos, sin variabilidad entre invocaciones.

### ESC-06: grupo-de-vida-unico-por-temporada
**Dado** que Ana pertence a un unico grupo de vida activo por temporada activa
**Y** Ana adicionalmente asiste a un taller y sirve en un equipo
**Cuando** se invoca la funcion pura con el identificador de Ana
**Entonces** el sistema devuelve el lider del grupo de vida activo como mentor oficial propuesto (P1)
**Y** **no debe** elegir lideres de taller o servicio mientras el grupo de vida activo se mantenga.