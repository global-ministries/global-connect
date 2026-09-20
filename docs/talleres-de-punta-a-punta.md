# Talleres de punta a punta

Cómo se abre un taller, cómo se inscribe una persona, cómo se arman los grupos y
quién ve qué. Dos direcciones —Conexión y Crecimiento—, una sola maquinaria.

| | |
|---|---|
| Fecha | 13 de septiembre de 2026 |
| Superficie | 32 pantallas hoy → **11** consolidadas |
| Tablas en juego | 18 |
| Direcciones involucradas | Conexión (Grupos de Corto Plazo) y Crecimiento |
| Estado | Diseño para revisar |

---

## 1. Diagnóstico: el catálogo funciona, el medio está roto

Se puede crear un taller, abrirle una edición y crearle grupos. Pero **nadie
puede inscribirse**, un inscrito **no se puede poner en un grupo**, y el líder
**no puede tomar asistencia**. Tres huecos en fila, justo en el tramo que la
iglesia necesita usar.

Nada de esto se descubre leyendo pantallas: las tres existen y se ven bien. Se
descubre siguiendo el hilo hasta la base de datos.

| Lo que falla | Por qué, en la base |
|---|---|
| **Nadie puede inscribirse** | La política que permite anotarse exige una capacidad que ninguna migración, disparador, pantalla ni acción otorga jamás. La persona aprieta el botón y la base lo rechaza. La otra vía —que un coordinador la inscriba— es una ruta de API que ninguna pantalla llama. |
| **Un inscrito no entra a un grupo** | `taller_inscripciones` no tiene columna de grupo ni tabla puente. Sin eso no hay lista; sin lista no hay asistencia; sin asistencia no hay certificado. |
| **El líder no toma asistencia** | La pantalla le pide escribir a mano el identificador de la sesión en la URL, muestra códigos en vez de nombres y no tiene control para marcar. El guardado exige un permiso de coordinador que un líder nunca tiene. |
| **El cupo no se respeta** | `taller_grupos.capacidad` existe y nunca se valida: ni disparador, ni verificación. Hoy se puede inscribir gente de más sin que nada se queje. |
| **Las temporadas no hacen nada** | `talleres_temporadas` y su pantalla existen; nadie las lee. Cerrar una temporada no cierra nada. La propia pantalla promete «marcá los talleres que abren inscripción cuando esta temporada esté abierta»: sin implementar. |
| **Inscribirse sin cuenta** | No existe, ni a medias. Sin token, sin política para visitantes, sin página pública. La etapa `public` de la bandera no desbloquea nada porque nadie la lee. |
| **El prefijo de rol en la URL no controla nada** | `requireOperacionalRole()` (`lib/platform/talleres/operacional.ts:137`) **no recibe ningún argumento**: ni ruta, ni capacidad. Sólo pregunta «¿tiene algún rol operacional?». No puede saber si estás en `/direccion` o en `/coordinacion`. Un líder que escribe `/talleres/direccion/talleres` entra. |
| **La base tampoco acota** | En la política de `taller_grupos` sólo la rama del coordinador está acotada; `lead.read`, `volunteer.read`, `participation.read` y `metrics.read` son chequeos pelados. En `taller_ediciones` **ninguna** de las siete ramas está acotada. Y aunque los otorgamientos tienen `scope_id`, `auth_has_talleres_capability` lo **ignora**: registra el alcance y no lo usa. |


> **Sumá las dos últimas filas.** Tenés 32 pantallas, 13 duplicadas por rol, y el
> aislamiento que esa duplicación supuestamente compra **no existe**. Pagás el
> precio completo y no compras nada. Lo único que hoy tapa el agujero es que
> algunos loaders filtran en la aplicación: el líder ve sólo sus grupos porque
> `loadEquipoGrupos` lo filtra por `persona_id`, no porque la base lo proteja. Y
> la página `equipos` —copia literal al 95% en ambas ramas— corre la consulta
> **sin ese filtro**.
>
> Hoy nadie real lo ve: las ocho capacidades de talleres en producción están
> otorgadas a una sola persona de prueba. Se vuelve real el día que le demos
> `lead.read` a los líderes de verdad.

---

## 2. Vocabulario

El sistema se nombró desde la implementación, no desde la iglesia.

| Hoy | Debe ser | Por qué |
|---|---|---|
| `abstracto` | **Taller** | Punto de Partida *es* un taller, exista o no una edición abierta ahora. «Abstracto» existe sólo porque hubo que distinguirlo de una tabla vieja. |
| `cohorte` | **Grupo** | Es una capa de más: hoy hay dos niveles donde alcanza uno. El que tiene sentido en la iglesia es el grupo: «Martes 7pm, con Juan». |
| `sesión` | **Clase** | Las cuatro clases de Próximo Paso tienen nombre propio: Sígueme, Intimidad con Dios, Compañerismo, Influencia. Hoy una sesión es sólo una fecha, sin título. |

Vocabulario completo, de arriba hacia abajo:

**Taller → Temporada de talleres → Edición → Grupo → Clase → Asistencia →
Certificado**, y la persona tiene una **Inscripción**.

---

## 3. Modelo

```
Taller  — el programa. Vive en el catálogo
│   de qué dirección cuelga · cuántas clases dura · cómo se abre
│   su equipo: director, líderes, voluntarios
│
├── Temporada de talleres  — propia, distinta de la de Grupos de Vida
│     fechas · ventana de inscripción · qué talleres abre
│
└── Edición  — el taller abierto una vez
    │   fechas · cupo · estado
    │
    ├── Grupo  — día, hora, líder, cupo
    │   │
    │   └── Clase  — con su nombre y su tema
    │         └── Asistencia
    │
    └── Inscripción  — la persona en esta edición
          se le asigna un grupo · al cerrar, Certificado
```

---

## 4. Cómo se abre un taller

Grupos de Vida es largo plazo: un grupo corre toda la temporada y la gente entra
cuando entra. Un taller es corto plazo: abre, se llena, arranca y cierra. Son dos
ritmos distintos, y por eso **talleres tiene sus propias temporadas** y **Grupos
de Vida no se toca**.

Y una temporada de talleres **no es de toda la iglesia: es de una dirección**
(decisión del usuario, 2026-09-20). Cada dirección que tiene talleres arma las
suyas, con sus fechas, porque el calendario de Conexión no tiene por qué ser el
de Crecimiento. Más todavía: **hay direcciones que no se manejan por temporada
en absoluto**. Eso obliga a una regla que es fácil romper sin darse cuenta: la
temporada **agrupa**, nunca **habilita**. Si abrir una edición exigiera una
temporada, las direcciones que no las usan no podrían abrir nada. La temporada
es una comodidad para decir "estos talleres abren juntos", no un portón.

Consecuencias concretas, para el paso 6:

- `talleres_temporadas` necesita dueño: una columna que apunte al nodo de la
  dirección en el organigrama, igual que `talleres.dream_team_equipo_id`. Hoy
  **no tiene ninguna**, así que es implícitamente de toda la iglesia.
- Con ese dueño, su RLS pasa a acotarse por árbol como todo lo demás desde el
  paso 3, y el agujero actual —cualquier director de cualquier rama puede crear,
  editar y borrar temporadas de todo el programa— se cierra **por construcción**,
  no con una regla especial.
- La pantalla `/talleres/temporadas` muestra las de las direcciones sobre las que
  quien mira tiene autoridad, y crear una pregunta a qué dirección pertenece.
- Momento oportuno: producción tiene **0 temporadas y 0 vínculos** (verificado el
  2026-09-20). Nadie la usó nunca, así que el modelo se corrige sin migrar un
  solo dato. Es ahora o se paga después.

Pero ni siquiera todos los talleres siguen el mismo ritmo entre ellos. Cada
taller declara cómo se abre:

**Régimen 1 — por temporada.** Abre cuando abre la temporada de talleres, *si
está marcado en esa temporada*, y dentro de su ventana de inscripción. No todos
los talleres abren en todas las temporadas.
→ Punto de Partida, Mujer de Hoy, los retiros de Crecimiento.

**Régimen 2 — por cadencia propia.** Abre solo, con su ritmo, sin depender de
ninguna temporada. Próximo Paso: primer domingo de cada mes, cuatro clases
semanales.
→ Próximo Paso.

### Las ediciones se adelantan, no se generan en la sombra

Cuando el director define la cadencia, el sistema crea las próximas seis
ediciones ahí mismo, con las fechas ya calculadas. Quedan a la vista, se corrigen
a mano si un domingo cae feriado, y no hace falta ningún trabajo programado.

Próximo Paso, las seis que vendrían:

| Edición | Clase 1 | Clase 4 | Cierra inscripción |
|---|---|---|---|
| Octubre 2026 | dom 4 oct | dom 25 oct | al comenzar la clase 1 |
| Noviembre 2026 | dom 1 nov | dom 22 nov | al comenzar la clase 1 |
| Diciembre 2026 | dom 6 dic | dom 27 dic | al comenzar la clase 1 |
| Enero 2027 | dom 3 ene | dom 24 ene | al comenzar la clase 1 |
| Febrero 2027 | dom 7 feb | dom 28 feb | al comenzar la clase 1 |
| Marzo 2027 | dom 7 mar | dom 28 mar | al comenzar la clase 1 |

### Las dos tablas ya existen, y no son la misma cosa

Conviene dejarlo escrito porque es fácil confundirlas —yo mismo las confundí una
vez— y porque son las dos mitades de este modelo:

| Tabla | Qué es | Columnas que importan |
|---|---|---|
| `taller_periodos_generales` | La **ventana de inscripción de una edición** | `taller_id`, `edicion_label`, `fecha_apertura_automatica`, `fecha_cierre_automatico`, **`fecha_apertura_manual`**, **`fecha_cierre_manual`**, `fecha_cierre_real`, `motivo_cierre` |
| `talleres_temporadas` + `talleres_temporada_talleres` | La **temporada que agrupa qué talleres abren** | `nombre`, `fecha_apertura`, `fecha_cierre`, `estado`; la puente relaciona `temporada_id → taller_id` |

Ninguna sobra: la primera es el Régimen 2, la segunda es el Régimen 1. Y fijate en
`fecha_apertura_manual` / `fecha_cierre_manual` / `motivo_cierre`: **la regla de
«que manualmente siempre se pueda abrir» ya tiene sus columnas.** No hay que
diseñarla, hay que usarla.

> **Por qué nada de trabajos nocturnos.** El único trabajo programado que tenía
> este proyecto (`talleres_period_closer`) estuvo meses fallando todas las noches
> contra una tabla renombrada. Y encima no hacía nada: era un contador. Nadie se
> enteró. Lo desprogramamos el 12 de septiembre de 2026.

---

## 5. Las reglas que decidimos

### Adoptado — la inscripción cierra por una fecha relativa, configurable

El cierre es **un desplazamiento respecto del inicio de la primera clase**, no
una fecha absoluta escondida en el código. Próximo Paso lo pone en cero: cierra
cuando arranca. Un retiro puede cerrar una semana antes por logística. Un taller
puede permitir entrar tarde, después de la primera clase. Si una edición puntual
necesita otra cosa, se la sobreescribe sin tocar el taller.

### Adoptado — el cupo cierra la puerta de la gente, nunca la mano del director

Se configuran las plazas. Cuando se llena, la inscripción pública se cierra sola.
Pero el director **siempre** puede reabrirla o meter a alguien por encima del
cupo: el sistema no le dice no a una decisión pastoral.

Con una condición: **el exceso se ve** —«3 sobre el cupo»— y queda registrado
quién lo hizo. No para controlar a nadie, sino para que en dos meses nadie
discuta por qué ese grupo tiene dieciocho personas.

### Adoptado — el estado de una edición se deriva de sus fechas

Hoy publicar es apretar un botón. Con una edición por mes son doce botones al año
que alguien tiene que acordarse de apretar; si se olvida uno, ese mes no hay
inscripciones y nadie se entera hasta que alguien pregunta.

Si la edición tiene fechas y ventana, el sistema ya sabe si está tomando
inscripciones, en curso o cerrada. Manual queda sólo lo que es una decisión
humana: **dejarla en borrador** hasta que esté lista, y **cancelarla**.

### Adoptado — una maquinaria, dos direcciones, sin ligarse

Qué tipo de cosa es y quién la administra son dos datos distintos: el tipo dice
«esto es un taller, se inscribe, se asiste, se certifica»; quién lo administra es
de qué nodo del organigrama cuelga. Próximo Paso ya es la prueba andando: es un
taller con toda la maquinaria de taller, administrado por DPS y no por Conexión.

Un retiro de perdón en Crecimiento usa la misma inscripción y la misma
certificación que Punto de Partida en Conexión, y cada director ve sólo lo suyo.
La ruta espiritual de la persona, en cambio, acumula lo de las dos direcciones,
que es justo lo que pide el documento pastoral.

### Condición (hoy no se cumple) — eso sólo es verdad si la autoridad sigue al árbol

Hoy los permisos de talleres miran el nodo exacto y no recorren el organigrama
(`auth_has_talleres_capability_scoped`). Consecuencia medida: una capacidad
global de talleres ve **todos** los talleres de **todas** las direcciones. Es
decir, hoy sí se ligan, y del peor modo.

Además «Director de grupos de corto plazo» —un rol que el documento pastoral
pide— **hoy no se puede expresar**: habría que otorgarle cada taller de a uno, y
cada taller nuevo queda afuera hasta que alguien se acuerde. Con la autoridad
siguiendo el árbol se otorga una vez sobre la dirección y alcanza a todo lo que
cuelgue, incluso lo que se cree mañana.

### Adoptado — la gente del taller son servicios de Dream Team

Talleres tiene su propia tabla para asignar gente a sus grupos, inventada porque
cuando se construyó no había un organigrama del cual colgarse. Ahora lo hay. Los
líderes y voluntarios de cada taller pasan a ser servicios de Dream Team en el
nodo de su taller.

La ganancia no es estética: se administran desde las pantallas que ya están
hechas y funcionando —Servidores y Mi equipo—, con sus etapas y su historial, en
vez de tener dos lugares donde se asigna gente.

### Descartado — un solo calendario para toda la iglesia

Era la propuesta inicial y estaba mal. Grupos de Vida es largo plazo y no tiene
ventana de inscripción; un taller sí. Meterlos en el mismo calendario habría roto
el modelo que hoy funciona bien. **Grupos de Vida queda exactamente como está.**

---

## 6. Qué hace y ve cada persona

| Actor | Qué hace | Qué no ve |
|---|---|---|
| **Administrador de plataforma** | Mantiene el catálogo: crea los talleres, define de qué dirección cuelga cada uno, cuántas clases dura y cómo se abre | No gestiona gente |
| **Director de dirección** | Su programa completo: talleres abiertos, gente inscrita, grupos andando, qué se certificó. Abre y cierra temporadas, y decide quién dirige cada taller | La otra dirección |
| **Director de taller** | Arma la edición: fechas, cupo y **los grupos**. Toma el listado de inscritos y los reparte. Aprueba o rechaza inscripciones y resuelve los pedidos de retiro | Los líderes que puede elegir son sólo los de su taller |
| **Líder de grupo** | Su lista de gente, sus clases, y marca asistencia clase por clase. Mientras la persona está en su taller, **él es su mentor** según la cascada pastoral | El grupo del otro líder ni los inscritos sin asignar |
| **Miembro** | Ve los talleres abiertos, se inscribe, y después ve su taller, su grupo, sus clases, su asistencia y su certificado, que le avanza la ruta espiritual. Puede pedir el retiro | *(hoy el botón de inscripción falla siempre)* |
| **Persona sin cuenta** | Aprieta Inscribirme y el sistema la invita a crear su cuenta ahí mismo: la puerta de entrada de gente nueva que pide el documento pastoral | *(hoy no existe ni a medias)* |

---

## 7. El contrato: qué significa «funciona»

Esto es lo que se va a probar, y se prueba **entrando a la base con la identidad
de cada persona**, no mirando la pantalla y suponiendo. Así aparecieron los
quince defectos de Dream Team que ninguna otra forma de probar encontró.

1. Se abre la inscripción: Punto de Partida, edición de esta temporada, con cupo y ventana.
2. Tres personas se inscriben, y una de ellas no tenía cuenta: la crea desde el mismo botón.
3. El director ve el listado: los tres, con su estado. Aprueba.
4. Arma dos grupos: «Martes 7pm» con Juan, «Jueves 7pm» con María. Juan y María son líderes **de ese taller**, no de cualquiera.
5. Reparte los inscritos: dos al de Juan, uno al de María.
6. Juan entra y ve **sólo su grupo**, con sus dos personas. No ve el grupo de María ni los inscritos sin asignar.
   *(Hoy esto NO lo garantiza la base: la rama `lead.read` de `taller_grupos` es un chequeo pelado. Lo único que lo sostiene es un filtro en la aplicación. Es el paso 3 del plan.)*
7. Juan marca la asistencia de la clase 1, por nombre, sin escribir identificadores en la URL.
8. Al cerrar, quien cumplió la asistencia recibe su certificado, y eso avanza su ruta espiritual.
9. El cupo se respeta: lleno, la inscripción pública se cierra. El director agrega a alguien más y el grupo muestra «1 sobre el cupo».
10. Las direcciones no se ven entre ellas: el director de Conexión ve los dos grupos y el avance del taller completo; el de Crecimiento no ve nada de esto, y viceversa con sus retiros.

---

## 8. Arquitectura de pantallas

### El bug está en la URL

```
/talleres/direccion/talleres      ← lista de talleres
/talleres/coordinacion/talleres   ← lista de talleres
/admin/talleres/abstracto         ← lista de talleres
```

La URL codifica **el rol**: `direccion`, `coordinacion`, `equipo`, `admin`. Y en
el momento en que el rol vive en la ruta, cada rol nuevo obliga a copiar *todas*
las pantallas. No es desorden: es una multiplicación. **4 prefijos de rol × 8
objetos reales = 32 pantallas.** Y todavía no entró Crecimiento; con un quinto rol
son 40.

**La regla: la URL codifica el objeto, no la audiencia.** El rol es un dato de
ejecución, no un segmento de ruta. Una sola página de edición: el director la
edita, el líder la lee, el miembro se ve a sí mismo.

### La disciplina que lo hace posible

Una página que sirve a cuatro roles se convierte en un monstruo de
`if (esDirector) … else if (esLider) …` si se hace de la forma obvia. La forma
que no se degrada son estas tres reglas, y **ya están andando en Dream Team**:

**1. El alcance lo resuelve la base, no la página.** En
`app/(auth)/dream-team/mi-equipo/page.tsx:49`: *«RLS scopes listEquipos() to the
caller's own branch»*. La página hace la misma consulta para todos. Al director le
vuelven 40 personas, al líder 8. Cero ramas en el código.

**2. Los permisos se resuelven una vez, en un dato.** Línea 123:
`const puedeEditar = hasDreamTeamWriteCapability(session)`. Un booleano, calculado
una sola vez en el servidor, pasado como prop.

**3. El render pregunta por la capacidad, nunca por el rol.** Línea 202:
`{puedeEditar && …}`. En ningún lugar del JSX aparece la palabra «director». Por
eso mañana se le puede dar esa capacidad a un rol nuevo sin tocar la pantalla.

> Si ramificás por rol, cada rol nuevo te hace editar cada pantalla. Si ramificás
> por capacidad, cada rol nuevo es un permiso otorgado y nada más.

### Por qué no se puede consolidar todavía

Acá está lo contraintuitivo. Si consolido ahora sobre el principio «una página, la
base decide qué ve cada uno», y **la base hoy dice que todos ven todo** (ver las
dos últimas filas del diagnóstico), el resultado es una pantalla que le muestra la
iglesia entera a un líder.

Hoy las páginas separadas esconden el problema por accidente, porque cada una
llama a un loader distinto y algunos filtran a mano. **Una sola página lo destapa
de golpe.**

Por eso el paso «autoridad al árbol» deja de ser sólo «aislar Conexión de
Crecimiento» y pasa a ser **el habilitador de toda la consolidación**. Va antes de
fusionar, no después. Y fusionar va antes de construir lo nuevo, para no
construirlo dos veces.

### De 32 a once

```
/talleres                              el catálogo
/talleres/[taller]                     el taller y sus ediciones
/talleres/[taller]/[edicion]           inscritos · grupos · clases · ventana
/talleres/[taller]/[edicion]/[grupo]   el grupo y su asistencia
/talleres/temporadas                   +  /[id]
/talleres/explorar                     inscribirme, también sin cuenta
/talleres/mi-recorrido                 +  /certificados/[id]
/talleres/reportes
/talleres/solicitudes
```

`periodos` no es una página: es la sección «ventana» de la edición. Y
`admin/talleres/*` no es un árbol aparte — el administrador ve la misma lista de
talleres que el director, con un botón más.

### El mapa de fusiones

Medido archivo por archivo:

| Hoy | Verdicto | Evidencia |
|---|---|---|
| `direccion/equipos` + `coordinacion/equipos` | **Fusionar.** Copia literal | ~95% idéntico. Sólo difieren el título, la etiqueta del botón de regreso y `.limit(200)` vs `.limit(100)`. Corren la **misma** consulta a `taller_grupos`. Es el único par sin loader compartido: la consulta está copiada en los dos archivos |
| `direccion/reportes` + `coordinacion/reportes` | **Fusionar** | ~85% compartido, y las dos llaman literalmente a `loadCoordReportes(ctx)`. Coordinación tiene un badge «Reabierto» que a dirección le falta: no es una decisión, es una función que se cayó |
| `direccion/solicitudes` + `coordinacion/solicitudes` | **Fusionar**, con la acción bajo capacidad | Mismo loader `loadCoordSolicitudes(ctx)`. La única diferencia real es que coordinación tiene los controles de aprobar/rechazar. Eso es un booleano, no una página |
| `direccion/talleres` + `coordinacion/talleres` | **Fusionar** en una, con un loader | Consultas distintas (plana con contadores vs agrupada por taller) para el mismo propósito. Coordinación filtra en la aplicación por `scopedEquipoIds` porque `taller_ediciones` no está acotada en la base — eso desaparece cuando la base acota |
| `direccion/` + `coordinacion/` (portada) | **Fusionar** | Mismo propósito, dos implementaciones: una hace 4 `count`, la otra trae 4 conjuntos completos y cuenta `.length` |
| `coordinacion/inscripciones` + `admin/talleres/inscripciones` | **Fusionar**: admin es el superconjunto | Comparten `<TablaInscripciones>` y las mismas server actions. Admin tiene todos los estados y filtros por URL; coordinación sólo pendientes con tope de 50 |
| `direccion/periodos` + `admin/talleres/temporadas` | **NO fusionar.** Son cosas distintas | Ver la sección 4: una es la ventana de una edición, la otra la temporada que agrupa talleres |

Las 13 pantallas de `direccion/` + `coordinacion/` colapsan en 6.

**Y la buena noticia: dos tercios del andamiaje ya existen.** `DashboardPage`,
`TablaInscripciones`, y los loaders compartidos de
`lib/platform/talleres/operacional.ts` que las dos ramas ya llaman idénticos. La
consolidación es más borrar que escribir.

---

## 9. Diseño de front-end

El objetivo es que usar esto se sienta como usar el resto del sistema. Con una
distinción que importa: **se parece a Grupos de Vida en la experiencia, y a Dream
Team en la implementación.**

Grupos de Vida es el código más viejo del repo y tiene deriva real (está más
abajo, en «qué no copiar»). Dream Team es de septiembre de 2026 y es el más
disciplinado. Las convenciones se toman de ahí.

### Las dos interacciones ya están resueltas

Lo más importante de esta sección: **las dos interacciones que le faltan a
talleres ya existen y funcionan en Grupos de Vida.** No hay que inventarlas.

**Tomar asistencia** → `components/grupos/AttendanceRegister.client.tsx`
(226 líneas, en producción). Lo que hace bien, y que el esbozo de talleres no hace:

- Arranca con **todos presentes** por defecto. Se marcan las excepciones, no la
  lista entera. En un grupo de 12 donde faltan 2, son 2 toques en vez de 12.
- Atajos «Marcar todos presentes / todos ausentes», con etiqueta corta en móvil y
  larga en escritorio (`sm:hidden` / `hidden sm:inline`).
- Contador vivo de presentes mientras se marca.
- El campo de motivo aparece **sólo al marcar ausente**. Divulgación progresiva:
  no muestra doce campos vacíos.
- Fecha, hora en formato 12h con AM/PM, y `tema` y `notas` de la reunión.

Ese último punto confirma una decisión del vocabulario: **`tema` ya existe en la
asistencia de Grupos de Vida.** «La Clase tiene nombre y tema» no es una
invención: es cómo ya funciona el sistema.

**Repartir inscritos en grupos** →
`app/(auth)/grupos-vida/segmentos/[segmentoId]/directores/DirectorGroupsModal.tsx`
(385 líneas). Ya asigna grupos a directores con selección múltiple en un modal. Es
el mismo problema con otros sustantivos. Existen además `components/ui/checkbox.tsx`
y `components/ui/table.tsx`.

### El esqueleto de una pantalla

```tsx
<ContenedorDashboard
  titulo="…"
  botonRegreso={{ href, texto }}
  breadcrumbs={…}
  accionPrincipal={<BotonSistema variante="primario">…</BotonSistema>}
>
  <div className="space-y-6">…</div>
</ContenedorDashboard>
```

**`ContenedorDashboard`, no `ContenedorPrincipal`.** Es lo que usan todas las
pantallas reales (`mi-equipo`, `grupos-vida`, `DashboardPage`). `ContenedorPrincipal`
es el envoltorio viejo, sin cabecera consciente del sidebar, sin botón de regreso
ni migas. Ojo: **el ejemplo de `docs/sistema-diseno.md` todavía muestra el viejo**
— la guía está desactualizada en ese punto, y `descripcion`/`subtitulo` de
`ContenedorDashboard` están marcados `@deprecated` en el código pero no en la guía.

- Cabecera fija que **encoge al hacer scroll** (`py-3` → `py-2`, título `text-lg` → `text-base`).
- Región de contenido: `p-4 sm:p-6 lg:px-12 lg:py-8`, con ritmo vertical `space-y-6`.
- Móvil tiene su propio componente, `components/ui/header-movil.tsx`.
- `DashboardPage` de talleres pone por defecto `botonRegreso = { href: '/dashboard', texto: 'Inicio' }`
  cuando no se lo pasan. Conviene conservarlo: toda subpágina tiene siempre una salida.

### Color y estado

Nunca un color crudo. Todo estado pasa por `BadgeSistema variante`:
`default` · `success` · `warning` · `error` · `info`.

Y cada dominio tiene **un solo archivo** con el mapa de estado a variante, más una
función de etiqueta. Talleres debe tener el suyo con la forma exacta de
`components/dream-team/labels.ts`:

```ts
export const ESTADO_BADGE_VARIANTE = {
  pendiente: 'warning', aprobado: 'success', no_aprobado: 'error',
  retirado: 'default', completado: 'default',
} as const
```

La regla, de la cabecera de ese archivo: **nunca renderizar al usuario una clave
cruda del catálogo — siempre pasar por estos helpers.**

### Filas y jerarquía

Donde haya una lista de una entidad que aparece en más de una pantalla, **un solo
componente de fila compartido**, como `NodoFila`. Su cabecera lo dice: *«para que
las dos pantallas rendericen exactamente la misma fila en vez de divergir».*

Anatomía de una fila, que es el patrón para toda la sección:

1. Chevron o espaciador de `44px` (`h-11 w-11`, objetivo táctil).
2. Nombre en `font-medium text-foreground`.
3. Badges de estado en `flex flex-wrap items-center gap-2`.
4. Debajo, **una** línea de metadatos: `TextoSistema variante="sutil" tamaño="sm"`.
5. Debajo, badges pequeños si hacen falta.
6. A la derecha, un slot `accesorio` que **decide quien llama**, no la fila.

Para árboles (el catálogo agrupado por dirección, la edición con sus grupos):
indentación de `14px` por nivel **con tope en `70px`**, más `border-l border-border pl-3`
en cualquier nivel anidado. El tope es deliberado: una rama profunda nunca empuja
el contenido fuera de un teléfono de 400px.

Y el colapso es **controlado**: la fila no guarda estado; quien la llama tiene un
`Set<string>` de ids colapsados y pasa `expandido` / `onToggleExpandido`.

Hay una regla de Dream Team que vale especialmente acá: `mostrarResponsables` deja
suprimir la línea de responsables cuando la pantalla ya está mostrando a esas mismas
personas como filas debajo. **No repetir la misma información dos veces.**

### Tablas

No existe un `TablaSistema` compartido —la guía lo lista como pendiente— y cada
tabla se escribe a mano, pero convergen:

- Envoltorio `<TarjetaSistema className="p-0">` con `<table className="w-full">` y `divide-y divide-border`.
- Encabezados: `px-4 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider`.
- Densidad de celda: **`px-4 py-3`** (la de talleres, más ajustada), no `px-6 py-4` (la vieja de Grupos de Vida).
- Celda vacía: raya em en `text-muted-foreground/50`. **Nunca un `<td>` en blanco.**
- Hover de fila: `hover:bg-muted/30 transition-colors`.
- Acciones: última columna a la derecha (`text-right`, `flex items-center justify-end gap-2`).
  Cuando no hay permiso de escritura, esa celda **muestra el badge de estado** en vez de quedar vacía.
- Móvil: **la tabla se vuelve tarjetas.** No scroll horizontal, no tabla apretada.
  `hidden md:block` para la tabla y `md:hidden` para un `space-y-3` de `TarjetaSistema`.
  Los dos bloques se mantienen duplicados en el mismo archivo: es la convención del
  repo, no vale la pena pelearla.

### Permisos en la interfaz

El patrón es un booleano resuelto en el servidor y bajado como prop —`puedeEditar`
o `canWrite`—, nunca re-derivado en el cliente desde un array de roles.

Y la regla concreta: **se esconde el control, no se deshabilita.**
`AvanceEtapaControl` hace `if (!puedeEditar || transicionesValidas.length === 0) return null`.
Un botón gris que no se puede apretar no informa: frustra.

### Confirmaciones, avisos y formularios

- **Confirmaciones: sólo `components/ui/dialog.tsx`** (Radix). Es lo que usa Dream
  Team para su confirmar-con-campos. Hay que evitar las otras tres que conviven en
  el repo: `ConfirmationModal.tsx`, el `window.confirm()` de `GruposList`, y el
  desplegable en línea de `RejectInscripcionButton`. Nota: `components/ui/alert-dialog.tsx`
  existe y **no tiene ni un consumidor** — parece la opción correcta y es código muerto.
- **Avisos: siempre `useNotificaciones()`**, nunca importar `toast` de sonner.
  Hoy `components/talleres/inscripcion-actions.tsx` lo incumple: pinta `<p role="alert">`
  con `bg-red-50` / `bg-emerald-50` a mano, sin compañero de modo oscuro. Hay que corregirlo.
- **Formularios**: no hay envoltorio; son pilas de `InputSistema` / `SelectSistema` /
  `TextareaSistema`, cada uno con su label y su error (`aria-describedby`, `aria-invalid`,
  `role="alert"`). Pendiente con `useTransition`, spinner con la prop `cargando` de
  `BotonSistema`, y campos deshabilitados mientras se envía.
- **Errores de validación en línea, resultado final en un toast.** No mezclar.
- **Server actions bajadas como props tipadas** (así lo hace ya `TablaInscripciones`),
  no importadas dentro del componente: deja que una página agregue telemetría o
  autorización extra sin tocar la fila compartida.
- **Bloqueo optimista**: mandar `expectedVersion` y, ante un `409`, la copia
  específica de Dream Team («otra persona… Recargá la página…»), no un error genérico.

### Vacíos y carga

- Vacío: `EstadoVacio` con `icono` (Lucide), `titulo` y `subtitulo` opcional. Es el
  más completo de los tres que hay y está pensado para ser agnóstico del dominio.
  Tono de la copia: corto y factual. «No hay inscritos todavía».
- Carga: un `loading.tsx` por ruta, con `SkeletonSistema` **imitando la forma real
  de la pantalla** —fila de indicadores, forma de la tabla, filas del árbol con su
  guía `border-l`—, no un spinner centrado.

### Navegación

La subnavegación de talleres ya es **el patrón más escalable del repo**:
`TalleresNavSubmenu` calcula sus items desde `getTalleresNavItems(sessionCapabilities)`
en `lib/platform/talleres/route-access.ts`, en vez de tener los hijos escritos a mano
en el sidebar como hace Grupos de Vida. Toda subárea nueva se agrega **al catálogo**,
no al sidebar.

Sus contadores usan `BadgeSistema` sólo cuando `count > 0`, con la convención de
color ya establecida: contadores de rol en `info`, contadores de pendientes en
`warning`.

**Pero hay una trampa**: `route-access.ts` es hoy una segunda fuente de verdad que
sólo controla la visibilidad del menú. **Nada garantiza que la capacidad declarada
ahí coincida con el portón real de la página.** Al consolidar, ese catálogo debe
pasar a ser la única fuente: la ruta declara su capacidad y el portón la lee de ahí.

### Escala tipográfica y espaciado

| Rol | Clases |
|---|---|
| Título de página (`nivel={1}`) | `text-xl sm:text-2xl font-semibold tracking-tight` |
| Título de sección (`nivel={2}`) | `text-lg sm:text-xl font-semibold tracking-tight` |
| Título de fila | `font-medium text-foreground` |
| Encabezado de tabla | `text-xs font-medium text-muted-foreground uppercase tracking-wider` |
| Metadatos | `TextoSistema variante="sutil" tamaño="sm"` |
| Etiqueta de formulario | `text-sm font-medium text-foreground` |

Ritmo entre secciones `space-y-6`; tarjeta `p-6`, fila densa `p-4`, vacío `p-8`;
badges en `gap-2`; radios `rounded-xl` en controles y `rounded-2xl` en tarjetas;
objetivo táctil `min-h-[44px]` en todo control interactivo.

### Qué NO copiar de Grupos de Vida

Esto es deriva real, no estilo, y conviene nombrarla para no propagarla:

- **Colores crudos de Tailwind sin modo oscuro**: `bg-orange-50`, `bg-indigo-100 text-indigo-700`,
  el `SEGMENTO_COLOR_MAP` completo. Violan la regla escrita en la propia guía y
  **hoy se ven mal en modo oscuro**. Es un defecto abierto de Grupos de Vida, fuera
  del alcance de este documento, pero que no debe entrar a talleres.
- **Un `GlassCard` escrito a mano** dentro de `GrupoDetailClient.tsx` que duplica `TarjetaSistema`.
- **Tres estrategias de confirmación** en un mismo dominio, una de ellas `window.confirm()`.

---

## 10. El plan, en orden de dependencia

Lo de arriba destraba lo de abajo. Dos reglas de orden que no son negociables:

1. **La base acota antes de que las pantallas se fusionen.** Consolidar sobre una
   base que no acota convierte un defecto escondido en una fuga visible.
2. **Las pantallas se fusionan antes de construir lo nuevo.** Si no, lo nuevo se
   construye dos veces y hay que fusionarlo después.

| # | Paso | Estado / tamaño |
|---|---|---|
| 0 | **La verdad del esquema.** Las migraciones no podían reconstruir producción, así que «funciona en staging» no probaba nada. El rename hecho a mano (25 objetos, incluida una función que comparten seis disparadores) quedó capturado; los permisos de las 18 tablas, escritos; dos migraciones que no podían ejecutarse, arregladas; el cron roto, desprogramado; los tipos de la base, regenerados | **Hecho** |
| 1 | **Que inscribirse no dependa de un permiso que nadie otorga.** Un miembro se inscribe por ser quien es, no por tener una capacidad. Es el único hueco que, solo, hace que nada del resto sirva | **Empieza acá** |
| 2 | **Que los talleres nuevos nazcan dentro del organigrama, con sus roles.** Hoy cada taller que se abre crea su equipo con `parent_equipo_id` nulo: queda colgando en el aire, donde ninguna autoridad por árbol lo alcanzaría. Y sin roles sembrados, no se le puede asignar un coordinador | Chico |
| 3 | **La autoridad al árbol, y las políticas acotadas de verdad.** Que `auth_has_talleres_capability` deje de ignorar el `scope_id` que ya guarda, y que las ramas `lead` / `volunteer` / `participation` / `metrics` de `taller_grupos` y `taller_ediciones` dejen de ser chequeos pelados. Habilita al director de dirección, al de grupos de corto plazo, el aislamiento Conexión / Crecimiento — **y la consolidación del paso 4** | Medio. **Cuello de botella** |
| 4 | **Consolidar las pantallas: de 32 a once.** La URL pasa a codificar el objeto. Las 13 de `direccion/` + `coordinacion/` colapsan en 6; `route-access.ts` pasa a ser la única fuente de verdad de qué capacidad exige cada ruta, leída por el portón y no sólo por el menú. Dos tercios del andamiaje ya existen: es más borrar que escribir | Medio |
| 5 | **El eslabón que falta: inscripción → grupo.** Armar los grupos desde el listado de inscritos, con los líderes del taller, adoptando el patrón de `DirectorGroupsModal`. Acá se funde la cohorte con el grupo, porque es el momento en que esa tabla se toca igual | Grande |
| 6 | **Temporadas, ventana, cupo y cadencia.** Implementar `talleres_temporadas`, que ya existe y no hace nada; la ventana relativa sobre las columnas `fecha_*_manual` que ya existen; el cupo que se valida y se puede pasar a mano; las ediciones adelantadas de Próximo Paso; los estados derivados de las fechas | Medio |
| 7 | **La asistencia del líder, de verdad.** Adoptar `AttendanceRegister` de Grupos de Vida: todos presentes por defecto, atajos en lote, motivo sólo al marcar ausente, y `tema` como el nombre de la clase | Medio |
| 8 | **Inscribirse sin cuenta.** La puerta que pide el documento pastoral. Es enteramente nueva: no hay token, ni política para visitantes, ni página pública | Nuevo |
| 9 | **Crecimiento como segunda dirección.** Con todo lo anterior hecho, es sembrar sus nodos y otorgar permisos. Los talleres especializados —perdón, retiros— usan la misma maquinaria | Al final |

---

## 11. Lo que falta decidir

No son decisiones técnicas.

1. **El dominio pastoral.** Producción no tiene sus nueve tablas y el código sí
   las consulta, en diez archivos. Aplicar sus diecisiete migraciones sería
   descongelar la Fase 4 que se congeló a propósito; dejarlo así significa que
   esas rutas fallan si alguien las abre. Tercera opción, y la recomendada:
   bloquearlas con una bandera hasta que se decida descongelar.
2. **El asistente viejo de crear talleres.** Capturar su función de quince
   argumentos (`create_taller_with_initial_state`), o borrar el asistente y la
   función. Recomendado: borrar; el reemplazo vivo ya existe.
3. **La lista de talleres de Crecimiento.** Perdón y retiros están nombrados;
   falta el resto para sembrar el organigrama de esa dirección completo.
4. **Quién ve la lista de inscritos de un taller sensible.** Anotarse en un
   taller de perdón no es lo mismo que anotarse en Punto de Partida. Merece la
   misma discusión que la de los resultados de los tests de dones.
5. **El modo oscuro roto de Grupos de Vida.** Fuera del alcance de este
   documento, pero encontrado al mapearlo: `GruposList.client.tsx` y
   `GrupoDetailClient.tsx` usan colores crudos de Tailwind sin compañero `dark:`
   (`bg-orange-50`, `bg-indigo-100`, el `SEGMENTO_COLOR_MAP`). Se ven mal en modo
   oscuro hoy. Decidir si se arregla en su propia tanda.

---

> **La regla que sostiene todo esto:** una sola maquinaria de talleres, y el
> organigrama decidiendo quién administra qué. Nada de duplicar el modelo por
> dirección, y nada de una capacidad global que vea la iglesia entera.
