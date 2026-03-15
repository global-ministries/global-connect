# API de Asistencia

## Tabla de Contenidos
1. [Obtener Reporte Analítico de Asistencia de Grupo](#obtener-reporte-analítico-de-asistencia-de-grupo)
2. [Obtener Reporte Analítico de Asistencia de Usuario](#obtener-reporte-analítico-de-asistencia-de-usuario)
3. [Registrar Asistencia v2](#registrar-asistencia-v2)
4. [Vista de Salud de Miembros](#vista-de-salud-de-miembros)
5. [Dashboard de Riesgo](#dashboard-de-riesgo)
6. [Reporte de Retención](#reporte-de-retención)
7. [Reporte de Crecimiento Neto](#reporte-de-crecimiento-neto)
8. [Server Actions](#server-actions)
9. [Tipos y Schemas Zod](#tipos-y-schemas-zod)

---

## Obtener Reporte Analítico de Asistencia de Grupo

Devuelve un reporte completo con KPIs, series temporales (agrupadas por semana) y lista de eventos históricos de asistencia para un grupo específico.

- **Función RPC:** `obtener_reporte_asistencia_grupo`
- **Permisos Requeridos:** El usuario debe tener permiso para ver el grupo (validado con `puede_ver_grupo`)

### Parámetros

```sql
obtener_reporte_asistencia_grupo(
  p_grupo_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
```

- **`p_grupo_id`** (uuid, required): ID del grupo del cual se quiere obtener el reporte
- **`p_auth_id`** (uuid, required): ID de autenticación del usuario que hace la solicitud
- **`p_fecha_inicio`** (date, optional): Fecha de inicio del rango de filtrado. Por defecto: 6 meses atrás
- **`p_fecha_fin`** (date, optional): Fecha de fin del rango de filtrado. Por defecto: fecha actual

### Estructura de Retorno (JSON)

```json
{
  "kpis": {
    "asistencia_promedio": 75.5,
    "total_reuniones": 24,
    "miembro_mas_constante": {
      "nombre": "Juan Pérez",
      "asistencias": 22
    },
    "miembro_mas_ausencias": {
      "nombre": "María García",
      "ausencias": 8
    }
  },
  "series_temporales": [
    {
      "semana": "2025-09-15",
      "porcentaje": 80.0
    },
    {
      "semana": "2025-09-22",
      "porcentaje": 75.0
    }
  ],
  "eventos_historial": [
    {
      "id": "uuid-evento-1",
      "fecha": "2025-09-22",
      "tema": "La Familia Importa",
      "presentes": 15,
      "total": 20,
      "porcentaje": 75.0
    },
    {
      "id": "uuid-evento-2",
      "fecha": "2025-09-15",
      "tema": "Valores Cristianos",
      "presentes": 16,
      "total": 20,
      "porcentaje": 80.0
    }
  ]
}
```

### Descripción de Campos

#### KPIs
- **`asistencia_promedio`**: Porcentaje promedio de asistencia en el período (0-100)
- **`total_reuniones`**: Número total de reuniones/eventos registrados
- **`miembro_mas_constante`**: Objeto con el nombre y número de asistencias del miembro más constante
- **`miembro_mas_ausencias`**: Objeto con el nombre y número de ausencias del miembro con más faltas

#### Series Temporales
Array de objetos con datos agrupados por semana:
- **`semana`**: Fecha de inicio de la semana (formato ISO: YYYY-MM-DD)
- **`porcentaje`**: Porcentaje promedio de asistencia de esa semana

**Nota:** Si hay múltiples eventos en una semana, se calcula el promedio de asistencia de todos ellos.

#### Eventos Historial
Array de objetos con información de cada evento:
- **`id`**: UUID del evento
- **`fecha`**: Fecha del evento (formato ISO: YYYY-MM-DD)
- **`tema`**: Tema del evento (string o "Sin tema")
- **`presentes`**: Número de miembros presentes
- **`total`**: Número total de miembros registrados
- **`porcentaje`**: Porcentaje de asistencia del evento (0-100)

### Respuestas de Error

Si el usuario no tiene permisos:
```json
{
  "error": "Sin permisos para ver este grupo"
}
```

Si el usuario no existe:
```json
{
  "error": "Usuario no encontrado"
}
```

### Ejemplo de Uso (TypeScript)

```typescript
const { data: reporteData, error } = await supabase.rpc(
  'obtener_reporte_asistencia_grupo',
  {
    p_grupo_id: 'uuid-del-grupo',
    p_auth_id: user.id,
    p_fecha_inicio: '2025-01-01',
    p_fecha_fin: '2025-12-31'
  }
)

if (error) {
  console.error('Error al obtener reporte:', error)
  return
}

console.log('Asistencia promedio:', reporteData.kpis.asistencia_promedio)
console.log('Total de reuniones:', reporteData.kpis.total_reuniones)
```

### Notas Técnicas

- La función usa `SECURITY DEFINER` para ejecutarse con privilegios elevados
- Los permisos se validan internamente con `puede_ver_grupo`
- Las series temporales se agrupan usando `DATE_TRUNC('week', fecha)`
- Los eventos se ordenan por fecha descendente (más recientes primero)
- Si no hay datos, se devuelven arrays vacíos y valores por defecto (0, 'N/D')
- Los KPIs de miembros incluyen el `id` del usuario para permitir navegación

---

## Obtener Reporte Analítico de Asistencia de Usuario

Devuelve un reporte completo con KPIs, series temporales (agrupadas por mes) y lista de eventos históricos de asistencia para un usuario específico.

- **Función RPC:** `obtener_reporte_asistencia_usuario`
- **Permisos Requeridos:** El solicitante debe cumplir al menos una de estas condiciones:
  - Ser el mismo usuario
  - Tener rol superior (admin, pastor, director-general)
  - Ser líder de un grupo al que pertenece el usuario
  - Ser director de etapa asignado a un grupo del usuario
  - Ser familiar directo del usuario

### Parámetros

```sql
obtener_reporte_asistencia_usuario(
  p_usuario_id uuid,
  p_auth_id uuid,
  p_fecha_inicio date DEFAULT NULL,
  p_fecha_fin date DEFAULT NULL
)
```

- **`p_usuario_id`** (uuid, required): ID del usuario del cual se quiere obtener el reporte
- **`p_auth_id`** (uuid, required): ID de autenticación del usuario que hace la solicitud
- **`p_fecha_inicio`** (date, optional): Fecha de inicio del rango de filtrado. Por defecto: 12 meses atrás
- **`p_fecha_fin`** (date, optional): Fecha de fin del rango de filtrado. Por defecto: fecha actual

### Estructura de Retorno (JSON)

```json
{
  "kpis": {
    "porcentaje_asistencia_general": 82.0,
    "total_grupos_activos": 2,
    "grupo_mas_frecuente": {
      "id": "uuid-grupo",
      "nombre": "Cabudare Matrimonios 2"
    },
    "ultima_asistencia_fecha": "2025-10-22"
  },
  "series_temporales": [
    {
      "mes": "2025-08-01",
      "porcentaje_asistencia": 100.0
    },
    {
      "mes": "2025-09-01",
      "porcentaje_asistencia": 75.0
    },
    {
      "mes": "2025-10-01",
      "porcentaje_asistencia": 80.0
    }
  ],
  "historial_eventos": [
    {
      "fecha": "2025-10-22",
      "grupo_nombre": "Cabudare Matrimonios 2",
      "grupo_id": "uuid-grupo",
      "tema": "Comunicación",
      "estado": "Presente",
      "motivo_ausencia": null
    },
    {
      "fecha": "2025-10-15",
      "grupo_nombre": "Cabudare Matrimonios 2",
      "grupo_id": "uuid-grupo",
      "tema": "Finanzas",
      "estado": "Ausente",
      "motivo_ausencia": "Viaje familiar"
    }
  ]
}
```

### Descripción de Campos

#### KPIs
- **`porcentaje_asistencia_general`**: Porcentaje promedio de asistencia del usuario en todos sus eventos (0-100)
- **`total_grupos_activos`**: Número de grupos diferentes en los que el usuario ha tenido eventos
- **`grupo_mas_frecuente`**: Objeto con el ID y nombre del grupo donde el usuario ha asistido más
- **`ultima_asistencia_fecha`**: Fecha de la última vez que el usuario estuvo presente (null si nunca ha asistido)

#### Series Temporales
Array de objetos con datos agrupados por mes:
- **`mes`**: Fecha de inicio del mes (formato ISO: YYYY-MM-DD)
- **`porcentaje_asistencia`**: Porcentaje de asistencia del usuario en ese mes

**Nota:** Se calcula el promedio de todos los eventos del mes.

#### Historial de Eventos
Array de objetos con información de cada evento:
- **`fecha`**: Fecha del evento (formato ISO: YYYY-MM-DD)
- **`grupo_nombre`**: Nombre del grupo donde se realizó el evento
- **`grupo_id`**: UUID del grupo (para navegación)
- **`tema`**: Tema del evento (string o "Sin tema")
- **`estado`**: "Presente" o "Ausente"
- **`motivo_ausencia`**: Motivo de la ausencia (null si estuvo presente)

### Validación de Permisos

La función valida los permisos en el siguiente orden:

1. **Usuario propio**: Si `p_auth_id` corresponde a `p_usuario_id`
2. **Roles superiores**: Si el solicitante tiene rol admin, pastor o director-general
3. **Líder de grupo**: Si el solicitante es líder de algún grupo al que pertenece el usuario
4. **Director de etapa**: Si el solicitante es director asignado a algún grupo del usuario
5. **Familiar directo**: Si existe una relación familiar entre ambos usuarios

Si ninguna condición se cumple, retorna error de permisos.

### Respuestas de Error

Si el usuario solicitante no existe:
```json
{
  "error": "Usuario solicitante no encontrado"
}
```

Si no tiene permisos:
```json
{
  "error": "Sin permisos para ver este reporte"
}
```

### Ejemplo de Uso (TypeScript)

```typescript
const { data: reporteData, error } = await supabase.rpc(
  'obtener_reporte_asistencia_usuario',
  {
    p_usuario_id: 'uuid-del-usuario',
    p_auth_id: user.id,
    p_fecha_inicio: '2025-01-01',
    p_fecha_fin: '2025-12-31'
  }
)

if (error || reporteData?.error) {
  console.error('Error al obtener reporte:', error || reporteData.error)
  return
}

console.log('Asistencia general:', reporteData.kpis.porcentaje_asistencia_general)
console.log('Grupos activos:', reporteData.kpis.total_grupos_activos)
console.log('Grupo favorito:', reporteData.kpis.grupo_mas_frecuente.nombre)
```

### Notas Técnicas

- La función usa `SECURITY DEFINER` para ejecutarse con privilegios elevados
- Los permisos se validan con múltiples condiciones (ver sección de Validación de Permisos)
- Las series temporales se agrupan usando `DATE_TRUNC('month', fecha)`
- Los eventos se ordenan por fecha descendente (más recientes primero)
- Si no hay datos, se devuelven arrays vacíos y valores por defecto (0, 'N/D', null)
- El período por defecto es de 12 meses (vs 6 meses en el reporte de grupo)

---

## Registrar Asistencia v2

Registra asistencia con soporte para tipos granulares de presencia, notas pastorales, visitantes y validación de ventana de edición. **Backward compatible** con el formato v1.

- **Función RPC:** `registrar_asistencia`
- **Archivo migración:** `20260315_010_registrar_asistencia_v2.sql`
- **Permisos:** Líder, co-líder del grupo, o superadmin

### Parámetros

```sql
registrar_asistencia(
  p_auth_id uuid,
  p_grupo_id uuid,
  p_fecha date,
  p_hora text DEFAULT NULL,
  p_tema text DEFAULT NULL,
  p_notas text DEFAULT NULL,
  p_asistencias jsonb DEFAULT NULL,
  -- Nuevos parámetros v2
  p_descripcion text DEFAULT NULL,
  p_puntos_oracion text DEFAULT NULL,
  p_notas_privadas_lider text DEFAULT NULL,
  p_conteo_visitantes integer DEFAULT 0,
  p_no_hubo_reunion boolean DEFAULT false,
  p_motivo_no_reunion text DEFAULT NULL,
  p_forzar_edicion boolean DEFAULT false
)
```

### Formato de `p_asistencias`

**v1 (legacy, sigue funcionando):**
```json
[{"usuario_id": "uuid", "presente": true}]
```

**v2 (recomendado):**
```json
[{"usuario_id": "uuid", "tipo_presencia": "presente", "motivo_inasistencia": null, "nota": "Llegó puntual"}]
```

Valores de `tipo_presencia`: `presente`, `ausente`, `tarde`, `justificado`

### Validación de Ventana de Edición

El RPC valida la ventana de edición según `configuracion_grupos_vida.modo_cierre_asistencia`:

| Modo | Comportamiento |
|------|---------------|
| `libre` | Sin restricción, siempre permite editar |
| `semanal` | Delegado al frontend (backend no enforce) |
| `ultimas_2_semanas` | Rechaza fechas anteriores a 14 días |
| `ultimo_mes` | Rechaza fechas anteriores a 30 días |

Si `p_forzar_edicion = true`, se salta la validación (requiere solicitud aprobada).

### Retorno

```json
{"ok": true, "evento_id": "uuid"}
```

Si no hubo reunión:
```json
{"ok": true, "evento_id": "uuid", "no_hubo_reunion": true}
```

---

## Vista de Salud de Miembros

Vista materializada que calcula el nivel de riesgo pastoral de cada miembro activo.

- **Vista:** `v_salud_miembros_grupo`
- **Migración:** `20260315_004_vista_salud_miembros.sql`

### Columnas

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `usuario_id` | uuid | ID del miembro |
| `grupo_id` | uuid | ID del grupo |
| `rol` | text | Rol en el grupo (líder, miembro, etc.) |
| `nombre_completo` | text | Nombre y apellido |
| `ultima_vez_presente` | timestamptz | Última asistencia registrada |
| `total_presencias` | integer | Veces presente o tarde |
| `total_ausencias` | integer | Veces ausente |
| `total_eventos` | integer | Total de eventos regulares (sin "no hubo reunión") |
| `pct_asistencia` | numeric | Porcentaje de asistencia (0-100) |
| `semanas_ausente` | integer | Semanas desde la última asistencia (99 si nunca) |
| `nivel_riesgo` | text | `normal`, `atencion`, `riesgo`, `critico` |

### Umbrales de Riesgo (configurables)

Los umbrales se leen de `configuracion_grupos_vida` por campus:

| Nivel | Default | Significado |
|-------|---------|-------------|
| `normal` | < 2 semanas | Asistencia regular |
| `atencion` | ≥ 2 semanas | Requiere seguimiento |
| `riesgo` | ≥ 4 semanas | Situación preocupante |
| `critico` | ≥ 6 semanas | Intervención urgente |

---

## Dashboard de Riesgo

KPIs globales para que directores y administradores monitoreen la salud pastoral de todos los grupos.

- **Función RPC:** `obtener_dashboard_riesgo`
- **Migración:** `20260315_009_rpc_dashboard_riesgo.sql`
- **Permisos:** Admin, pastor, director general, director de etapa

### Retorno

```json
{
  "total_grupos": 45,
  "grupos_sin_reunion_esta_semana": 3,
  "miembros_criticos": 12,
  "miembros_en_riesgo": 28,
  "miembros_en_atencion": 41,
  "solicitudes_pendientes": 5,
  "visitantes_del_mes": 18,
  "top_5_grupos_riesgo": [
    {"grupo_id": "uuid", "grupo_nombre": "Grupo Norte", "criticos": 3, "riesgo_total": 7, "total_miembros": 15}
  ],
  "tendencia_asistencia_4_semanas": [
    {"semana": "2026-03-04", "pct": 78.5}
  ]
}
```

---

## Reporte de Retención

Compara miembros entre dos temporadas para medir retención, renovación y egresos.

- **Función RPC:** `obtener_reporte_retencion`
- **Migración:** `20260315_007_rpc_reporte_retencion.sql`

### Parámetros

| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_auth_id` | uuid | ✅ | Auth ID del solicitante |
| `p_temporada_actual_id` | uuid | ✅ | Temporada a comparar |
| `p_temporada_anterior_id` | uuid | ❌ | Temporada base (auto-detecta si omitido) |
| `p_campus_id` | uuid | ❌ | Filtro de campus |

### Retorno

```json
{
  "miembros_que_continuaron": 120,
  "miembros_anteriores": 150,
  "miembros_nuevos": 35,
  "miembros_no_renovaron": 30,
  "pct_retencion": 80.0,
  "detalle_no_renovaron": [
    {"usuario_id": "uuid", "nombre": "Juan Pérez"}
  ]
}
```

---

## Reporte de Crecimiento Neto

Timeline de ingresos y egresos de miembros por mes para analizar tendencias de crecimiento.

- **Función RPC:** `obtener_reporte_crecimiento_neto`
- **Migración:** `20260315_008_rpc_reporte_crecimiento.sql`

### Parámetros

| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_auth_id` | uuid | ✅ | Auth ID del solicitante |
| `p_grupo_id` | uuid | ❌ | Filtro por grupo |
| `p_campus_id` | uuid | ❌ | Filtro por campus |
| `p_meses` | integer | ❌ | Período en meses (default: 6) |

### Retorno

```json
{
  "timeline": [
    {"mes": "2026-01-01", "etiqueta": "Ene 2026", "ingresos": 12, "egresos": 3, "neto": 9}
  ]
}
```

---

## Server Actions

Archivo: `lib/actions/asistencia-avanzada.actions.ts`

| Action | Descripción | Permisos |
|--------|-------------|----------|
| `registrarAsistenciaV2` | Registra asistencia con campos v2 | Líder/co-líder del grupo |
| `obtenerSaludMiembrosGrupo` | Obtiene salud de miembros desde la vista | Líder/co-líder del grupo |
| `obtenerDashboardRiesgo` | Obtiene KPIs globales de riesgo | Admin, pastor, director |
| `obtenerReporteRetencion` | Compara retención entre temporadas | Admin, pastor, director |
| `obtenerReporteCrecimientoNeto` | Timeline de crecimiento neto | Admin, pastor, director |
| `solicitarEdicionTardia` | Solicita permiso para editar asistencia cerrada | Líder/co-líder del grupo |

Todas las actions usan:
- `createSupabaseServerClient()` + `auth.getUser()` para autenticación
- Zod schemas para validación de inputs
- Tipo genérico `Res<T>` para retorno uniforme

---

## Tipos y Schemas Zod

Archivo: `lib/types/asistencia-avanzada.types.ts`

| Schema | Tipo | Descripción |
|--------|------|-------------|
| `tipoPresenciaSchema` | enum | `presente`, `ausente`, `tarde`, `justificado` |
| `registroAsistenciaSchema` | object | Registro individual (backward compat v1/v2) |
| `registrarAsistenciaPayloadSchema` | object | Payload completo del formulario |
| `resultadoAsistenciaSchema` | object | Respuesta del RPC |
| `saludMiembroSchema` | object | Fila de `v_salud_miembros_grupo` |
| `dashboardRiesgoSchema` | object | KPIs del dashboard de riesgo |
| `reporteRetencionSchema` | object | Datos de retención entre temporadas |
| `reporteCrecimientoNetoSchema` | object | Timeline de crecimiento neto |
| `modoCierreSchema` | enum | `semanal`, `libre`, `ultimas_2_semanas`, `ultimo_mes` |
| `configAsistenciaSchema` | object | Sub-set de configuración de asistencia |
