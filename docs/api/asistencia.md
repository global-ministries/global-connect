# API de Asistencia

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
