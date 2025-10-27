# API de Asistencia

## Tabla de Contenidos
1. [Obtener Reporte Analítico de Asistencia de Grupo](#obtener-reporte-analítico-de-asistencia-de-grupo)
2. [Obtener Reporte Analítico de Asistencia de Usuario](#obtener-reporte-analítico-de-asistencia-de-usuario)

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
