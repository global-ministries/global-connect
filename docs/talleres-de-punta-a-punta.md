# Talleres de punta a punta

Cómo se abre un taller, cómo se inscribe una persona, cómo se arman los grupos y
quién ve qué. Dos direcciones —Conexión y Crecimiento—, una sola maquinaria.

| | |
|---|---|
| Fecha | 13 de septiembre de 2026 |
| Superficie actual | 32 pantallas, 18 tablas |
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
7. Juan marca la asistencia de la clase 1, por nombre, sin escribir identificadores en la URL.
8. Al cerrar, quien cumplió la asistencia recibe su certificado, y eso avanza su ruta espiritual.
9. El cupo se respeta: lleno, la inscripción pública se cierra. El director agrega a alguien más y el grupo muestra «1 sobre el cupo».
10. Las direcciones no se ven entre ellas: el director de Conexión ve los dos grupos y el avance del taller completo; el de Crecimiento no ve nada de esto, y viceversa con sus retiros.

---

## 8. Las 32 pantallas

| Zona | Veredicto | Por qué |
|---|---|---|
| **Catálogo y edición** (admin, 9 pantallas) | Sobreviven, con las palabras cambiadas | Crear taller, abrir edición y crear grupos funcionan. Se renombra «abstracto» y se les suma el cupo, la ventana y la cadencia |
| **Dirección y coordinación** (18 pantallas) | Se rediseñan por dirección | Hoy la pantalla se llama «Dirección» y dice «vista global del programa»: está construida sobre la suposición de que hay un solo programa con un solo director. Con dos direcciones, mezcla los números de Conexión con los de Crecimiento |
| **Participante** (explorar, mis talleres, historial, certificados) | Sirven, pero hoy no llegan a nada | La lista de talleres abiertos y el detalle están bien. Fallan porque la inscripción no pasa, y porque el participante necesita una capacidad que nadie otorga |
| **Equipo del líder** (mis grupos, próximas clases, recursos) | Se reconstruyen | La asistencia es un esbozo. Y los tres enlaces del menú apuntan a rutas que no existen: todo el submenú del líder está roto |
| **Asistente viejo** (`/admin/talleres/nuevo`) | Se descarta | Sin enlaces entrantes, sin guarda de página, y su redirección de éxito apunta a una ruta que no existe: aunque funcione, termina en un 404 |

---

## 9. El plan, en orden de dependencia

Lo de arriba destraba lo de abajo.

| # | Paso | Estado / tamaño |
|---|---|---|
| 0 | **La verdad del esquema.** Las migraciones no podían reconstruir producción, así que «funciona en staging» no probaba nada. El rename hecho a mano (25 objetos, incluida una función que comparten seis disparadores) quedó capturado; los permisos de las 18 tablas, escritos; dos migraciones que no podían ejecutarse, arregladas; el cron roto, desprogramado; los tipos de la base, regenerados | **Hecho** |
| 1 | **Que inscribirse no dependa de un permiso que nadie otorga.** Un miembro se inscribe por ser quien es, no por tener una capacidad. Es el único hueco que, solo, hace que nada del resto sirva | **Empieza acá** |
| 2 | **Que los talleres nuevos nazcan dentro del organigrama, con sus roles.** Hoy cada taller que se abre crea su equipo con `parent_equipo_id` nulo: queda colgando en el aire, donde ninguna autoridad por árbol lo alcanzaría. Y sin roles sembrados, no se le puede asignar un coordinador | Chico |
| 3 | **La autoridad al árbol.** Recién acá tiene sentido: antes, los talleres nuevos quedarían afuera. Habilita al director de dirección, al de grupos de corto plazo, y el aislamiento entre Conexión y Crecimiento | Medio |
| 4 | **El eslabón que falta: inscripción → grupo.** Armar los grupos desde el listado de inscritos, con los líderes del taller. Acá se funde la cohorte con el grupo, porque es el momento en que esa tabla se toca igual | Grande |
| 5 | **Temporadas, ventana, cupo y cadencia.** Implementar la tabla que ya existe y no hace nada; la ventana relativa configurable; el cupo que se valida y se puede pasar a mano; las ediciones adelantadas de Próximo Paso; los estados derivados de las fechas | Medio |
| 6 | **La asistencia del líder, de verdad.** Su lista por nombre, sus clases con título, y marcar con un permiso que el líder sí tiene | Medio |
| 7 | **Inscribirse sin cuenta.** La puerta que pide el documento pastoral. Es enteramente nueva: no hay token, ni política para visitantes, ni página pública | Nuevo |
| 8 | **Crecimiento como segunda dirección.** Con todo lo anterior hecho, es sembrar sus nodos y otorgar permisos. Los talleres especializados —perdón, retiros— usan la misma maquinaria | Al final |

---

## 10. Lo que falta decidir

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

---

> **La regla que sostiene todo esto:** una sola maquinaria de talleres, y el
> organigrama decidiendo quién administra qué. Nada de duplicar el modelo por
> dirección, y nada de una capacidad global que vea la iglesia entera.
