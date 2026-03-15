# Grupos de Vida — Guía de Usuario

> Versión: 2.0.0 | Última actualización: 2026-03-14

## ¿Qué es?

El módulo de Grupos de Vida te permite gestionar los grupos pequeños de la organización: crearlos, asignar líderes y miembros, registrar asistencia, hacer seguimiento pastoral, y administrar las casas donde se reúnen.

## ¿Quién puede usarlo?

| Rol | Acceso |
|-----|--------|
| Admin | Completo: todas las funciones sin restricción |
| Pastor | Completo: todas las funciones sin restricción |
| Director General | Gestión de los segmentos que tiene asignados |
| Director de Etapa | Gestión de los grupos que tiene asignados |
| Líder | Gestión de su propio grupo activo |
| Miembro | Solo lectura de su grupo y su propia asistencia |

---

## Grupos

### Ver la lista de grupos

1. En el menú lateral, hacer clic en **Grupos de Vida**
2. Verás cuatro pestañas: **Actuales**, **Pasados**, **Futuros**, y **Mis Grupos**
3. Usa la barra de búsqueda para filtrar por nombre del grupo o líder
4. Usa los filtros avanzados para buscar por temporada, segmento o estado

> 💡 Los KPIs (tarjetas de resumen) siempre muestran los totales de la pestaña seleccionada, sin importar los filtros de búsqueda activos.

### Crear un grupo nuevo

1. Ir a **Grupos de Vida** y hacer clic en **Crear Grupo**
2. Completar los datos básicos:
   - **Nombre del grupo**: un nombre descriptivo
   - **Segmento**: categoría del grupo (Matrimonios, Jóvenes, Mujeres, etc.)
   - **Temporada**: período al que pertenece
   - **Campus y Localidad**: zona geográfica
3. Seleccionar un **líder** usando el buscador
4. Opcionalmente, seleccionar una **casa anfitriona** donde se reunirá
5. Si no seleccionas casa, completar la dirección manualmente
6. Hacer clic en **Crear Grupo**

> 💡 El grupo se crea en estado "pendiente de aprobación". Un director general o admin debe aprobarlo desde **Solicitudes** para que quede activo.

### Editar un grupo

1. Hacer clic en el nombre del grupo para ver su detalle
2. Hacer clic en **Editar** (botón en la parte superior)
3. Modificar los datos necesarios
4. Si cambias la casa anfitriona, el mapa se actualizará automáticamente con la nueva ubicación
5. Hacer clic en **Guardar Cambios**

### Ver detalle de un grupo

1. Hacer clic en cualquier grupo de la lista
2. Verás:
   - **Información general**: líder, segmento, temporada, estado
   - **Miembros**: lista completa con roles
   - **Casa anfitriona**: dirección y mapa
   - **Estadísticas**: asistencia promedio, cantidad de miembros

---

## Miembros

### Agregar un miembro al grupo

1. Ir al detalle del grupo
2. Hacer clic en **Añadir miembro**
3. Buscar al miembro por nombre
4. Seleccionar y confirmar

> ⚠️ **Importante**: Según la configuración del sistema, se pueden dar dos situaciones:
> - **Agregar directo**: Si tu rol tiene permiso para agregar sin aprobación, el miembro se agrega inmediatamente
> - **Crear solicitud**: Si no tienes permiso, se creará una solicitud de ingreso que un director aprobará

### Eliminar un miembro del grupo

1. Ir al detalle del grupo
2. Encontrar al miembro en la lista
3. Hacer clic en el ícono de eliminar (rojo)
4. Confirmar la eliminación

> ⚠️ Dependiendo de la configuración, este botón puede crear una **solicitud de egreso** en vez de eliminar directamente. Un director revisará la solicitud.

---

## Solicitudes

### Ver solicitudes pendientes

1. Ir a **Grupos de Vida > Solicitudes** (en el menú lateral)
2. En la pestaña **Pendientes** verás todas las solicitudes que esperan aprobación
3. Puedes filtrar por tipo: Ingreso, Egreso, Traslado, Activación, Cambio de Rol
4. Hacer clic en una solicitud para ver los detalles y aprobar o rechazar

### Ver mis solicitudes

1. Ir a **Grupos de Vida > Solicitudes > Mis Solicitudes**
2. Verás todas las solicitudes que tú has creado con su estado

### Tipos de solicitudes

| Tipo | Descripción |
|------|-------------|
| **Ingreso** | Un miembro quiere unirse a un grupo |
| **Egreso** | Un miembro sale de un grupo |
| **Traslado** | Un miembro se mueve de un grupo a otro |
| **Cambio de Rol** | Cambiar el rol de un miembro dentro del grupo |
| **Activación** | Solicitar que un grupo nuevo sea aprobado |

---

## Casas Anfitrionas

### ¿Qué es una casa anfitriona?

Es el lugar físico donde se reúne un grupo de vida. Puede ser la casa de un miembro, un local alquilado, o cualquier espacio disponible. Un mismo anfitrión puede ofrecer su casa varios días para diferentes grupos.

### Ver casas anfitrionas

1. Ir a **Grupos de Vida > Casas Anfitrionas** (en el menú lateral)
2. En computadora verás una tabla, en celular verás tarjetas
3. Cada casa muestra: anfitrión, dirección, capacidad, estado de aprobación

### Registrar una casa anfitriona nueva

1. Ir a **Casas Anfitrionas** y hacer clic en **Registrar Casa**
2. Seleccionar al **anfitrión** (debe ser un miembro registrado)
3. Opcionalmente, seleccionar un **co-anfitrión** (ej: el cónyuge)
4. Completar la dirección de la casa
   - Si el anfitrión ya tiene dirección registrada, el sistema te sugerirá usarla
5. Indicar la **capacidad** de personas
6. Seleccionar los **días disponibles** de la semana
7. Agregar notas adicionales si es necesario
8. Hacer clic en **Guardar**

> 💡 La casa se crea en estado "pendiente". Un admin, pastor o director general debe aprobarla.

### Aprobar o rechazar una casa (solo admin, pastor o director general)

1. Ir al detalle de la casa (hacer clic en su nombre)
2. Si tienes permisos, verás los botones **Aprobar** o **Rechazar**
3. Al aprobar, la casa estará disponible para asignar a grupos

---

## Mapa de Grupos

### Ver el mapa

1. Ir a **Grupos de Vida > Mapa** (en el menú lateral)
2. Verás un mapa interactivo con marcadores para cada grupo que tiene ubicación
3. Hacer clic en un marcador para ver: nombre del grupo, líder, segmento, estado

### Geocodificación masiva (solo admin)

1. Ir a **Grupos de Vida > Configuración**
2. En la sección del mapa, hacer clic en **Geocodificar casas sin coordenadas**
3. El sistema calculará las coordenadas de todas las casas que no las tienen

---

## Segmentos

### ¿Qué es un segmento?

Los segmentos son categorías que agrupan los grupos de vida por tipo: Matrimonios, Jóvenes, Mujeres, Hombres, Mixtos, etc.

### Ver segmentos

1. Ir a **Grupos de Vida > Segmentos** (en el menú lateral)
2. Verás la lista con el total de grupos y directores por segmento
3. Hacer clic en un segmento para ver sus directores

### Gestionar directores de un segmento

1. Ir al detalle del segmento
2. Verás los directores de etapa asignados y sus grupos
3. Puedes asignar nuevos directores o reasignar grupos

---

## Configuración (solo admin)

### Acceder a la configuración

1. Ir a **Grupos de Vida > Configuración** (en el menú lateral)
2. Opciones disponibles:
   - **Ventana de edición de asistencia**: cuánto tiempo puede un líder editar la asistencia
   - **Visitantes**: activar o desactivar el conteo de visitantes
   - **Umbrales de salud**: configurar cuántas semanas definen cada nivel de riesgo
   - **Permisos de gestión de miembros**: desde qué rol se puede agregar o eliminar miembros directamente
   - **Geocodificación masiva**: calcular coordenadas de casas sin ubicación

---

## Dashboard de Riesgo

### ¿Qué es?

Una vista para directores y admins que muestra la salud general de los grupos: cuántos miembros están en riesgo, qué grupos no se han reunido, y tendencias de asistencia.

### Acceder al dashboard

1. Ir a **Grupos de Vida > Dashboard Riesgo** (en el menú lateral)
2. Verás:
   - **Gráfico de distribución**: cuántos miembros están en cada nivel de salud
   - **Tendencia de 4 semanas**: evolución de la salud
   - **Miembros críticos**: tabla con los miembros que necesitan atención urgente
   - **Riesgo por segmento**: barras comparativas por categoría
   - **Grupos sin reunión**: lista de grupos que no se han reunido recientemente

### Ver miembros en riesgo

1. Desde el dashboard, hacer clic en **Ver listado completo**
2. Verás la página de **Miembros en Riesgo** con:
   - Tarjetas de conteo (críticos, en riesgo, atención)
   - Búsqueda por nombre o grupo
   - Tabla con nivel de riesgo, grupo al que pertenece, y enlace directo

---

## Notas de Líderes

### ¿Qué es?

Cada vez que un líder registra asistencia, puede agregar notas pastorales (puntos de oración, observaciones, notas privadas). Los directores y admins pueden ver un resumen de todas las notas.

### Ver notas

1. Ir a **Notas de Líderes** (en el menú lateral, sección Informes)
2. Verás una tabla con las últimas notas, filtrable por grupo y líder
3. Cada nota muestra: fecha, grupo, líder, descripción de la reunión

---

## Reporte Semanal

### Generar un reporte

1. Ir al grupo de vida y buscar la sección de **Reporte Semanal**
2. El reporte muestra:
   - Asistencia promedio de la semana
   - Grupos activos vs inactivos
   - Grupos en riesgo (por debajo del 70% de asistencia)
   - Miembros nuevos y egresos

---

## Preguntas Frecuentes

**¿Qué pasa si un grupo no tiene casa anfitriona asignada?**
Puedes asignarle una dirección manual directamente en el formulario de edición del grupo. La casa anfitriona es opcional.

**¿Un miembro puede estar en más de un grupo?**
Sí. Un miembro puede pertenecer a varios grupos simultáneamente.

**¿Puedo ver la asistencia de semanas anteriores?**
Sí. En el historial de asistencia del grupo puedes navegar por fechas. Hay rankings de miembros más constantes y con más ausencias.

**¿Los líderes pueden aprobar solicitudes?**
No. Las solicitudes solo pueden ser procesadas por directores de etapa, directores generales, pastores o administradores.

**¿Qué pasa al rechazar una solicitud de activación?**
El grupo se elimina completamente del sistema.

**¿Los matrimonios se agrupan en la asistencia?**
Sí. Si el grupo es de tipo "Matrimonios", la asistencia agrupa automáticamente a las parejas de cónyuges juntas.

**¿El líder puede ver todo el menú?**
No. El menú lateral solo muestra las opciones que corresponden a tu rol. Por ejemplo, los líderes no ven "Configuración" ni "Dashboard de Riesgo".
