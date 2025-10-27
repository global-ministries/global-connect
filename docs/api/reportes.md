# API de Reportes

Documentación de las funciones RPC relacionadas con reportes y análisis de datos en Global Connect.

## Tabla de Contenidos

- [obtener_reporte_semanal_asistencia](#obtener_reporte_semanal_asistencia)

---

## obtener_reporte_semanal_asistencia

Genera un reporte consolidado de asistencia para una semana específica, incluyendo KPIs globales, tendencias históricas, análisis por segmento y listas de grupos destacados y en riesgo.

### Descripción

Esta función proporciona una vista ejecutiva completa de la asistencia semanal de la organización. Es especialmente útil para roles de liderazgo que necesitan:

- Monitorear la salud general de la comunidad
- Identificar tendencias de asistencia a lo largo del tiempo
- Comparar el rendimiento entre diferentes segmentos
- Detectar grupos que necesitan atención pastoral
- Reconocer grupos con excelente asistencia

### Características Clave

- **Permisos Multinivel**: Respeta estrictamente el alcance de datos según el rol del usuario
- **Análisis Temporal**: Incluye tendencia de las últimas 8 semanas para contexto histórico
- **Comparativa**: Calcula variación vs. semana anterior automáticamente
- **Segmentación**: Agrupa y compara datos por segmentos organizacionales
- **Accionable**: Identifica grupos perfectos (100%) y grupos en riesgo (menor asistencia)

### Sintaxis

```sql
obtener_reporte_semanal_asistencia(
  p_auth_id uuid,
  p_fecha_semana date DEFAULT NULL
) RETURNS jsonb
```

### Parámetros

| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `p_auth_id` | `uuid` | Sí | UUID de autenticación del usuario solicitante (de `auth.users`) |
| `p_fecha_semana` | `date` | No | Cualquier fecha dentro de la semana a analizar. Si es `NULL`, usa la semana actual. La función calcula automáticamente el rango domingo-sábado |

### Sistema de Permisos

La función implementa un sistema de permisos estricto que determina qué datos puede ver cada usuario:

#### Matriz de Permisos

| Rol | Alcance de Datos | Descripción |
|-----|------------------|-------------|
| `admin` | **Todos los grupos** | Acceso completo a todos los datos de la organización |
| `pastor` | **Todos los grupos** | Acceso completo a todos los datos de la organización |
| `director-general` | **Todos los grupos** | Acceso completo a todos los datos de la organización |
| `director-etapa` | **Grupos asignados** | Solo ve datos de grupos donde está asignado como director (tabla `director_etapa_grupos`) |
| `lider` | ❌ **Sin acceso** | No tiene permisos para ver este reporte |
| `miembro` | ❌ **Sin acceso** | No tiene permisos para ver este reporte |

#### Lógica de Filtrado

Para directores de etapa, la función aplica automáticamente un filtro:

```sql
-- Permisos director-etapa: solo grupos asignados al usuario
EXISTS (
  SELECT 1
  FROM public.director_etapa_grupos deg
  JOIN public.segmento_lideres sl ON sl.id = deg.director_etapa_id
  WHERE deg.grupo_id = g.id
    AND sl.usuario_id = v_user_id
    AND sl.tipo_lider = 'director_etapa'
)
```

Esto garantiza que:
- Todos los KPIs se calculan solo sobre sus grupos asignados
- Las tendencias históricas solo incluyen sus grupos
- Los segmentos solo muestran datos de sus grupos
- Las listas de grupos perfectos/en riesgo solo incluyen sus grupos

### Estructura de Retorno

La función retorna un objeto JSON con la siguiente estructura:

```typescript
{
  semana: {
    inicio: string        // Fecha de inicio (domingo) en formato YYYY-MM-DD
    fin: string          // Fecha de fin (sábado) en formato YYYY-MM-DD
    numero: number       // Número de semana del año (1-52)
  },
  kpis_globales: {
    porcentaje_asistencia_global: number    // Porcentaje de asistencia (0-100)
    variacion_semana_anterior: number       // Diferencia vs semana anterior (+/-)
    total_reuniones_registradas: number     // Cantidad de eventos registrados
    total_grupos_con_reunion: number        // Cantidad de grupos que tuvieron reunión
  },
  tendencia_asistencia_global: [
    {
      semana_inicio: string    // Fecha de inicio de cada semana
      porcentaje: number       // Porcentaje de asistencia de esa semana
    }
    // ... 8 semanas en total, ordenadas cronológicamente
  ],
  asistencia_por_segmento: [
    {
      id: string              // UUID del segmento
      nombre: string          // Nombre del segmento
      porcentaje_asistencia: number    // Porcentaje de asistencia del segmento
      total_reuniones: number          // Cantidad de reuniones del segmento
    }
    // ... ordenados por porcentaje descendente
  ],
  top_5_grupos_perfectos: [
    {
      id: string         // UUID del grupo
      nombre: string     // Nombre del grupo
      lideres: string    // Nombres de líderes separados por coma
    }
    // ... hasta 5 grupos con 100% de asistencia
  ],
  top_5_grupos_en_riesgo: [
    {
      id: string                    // UUID del grupo
      nombre: string                // Nombre del grupo
      porcentaje_asistencia: number // Porcentaje de asistencia
      lideres: string               // Nombres de líderes separados por coma
    }
    // ... hasta 5 grupos con menor asistencia
  ]
}
```

### Ejemplo de Uso en TypeScript

```typescript
import { createSupabaseServerClient } from '@/lib/supabase/server'

// En un Server Component (Next.js 13/14)
export default async function ReportePage() {
  const supabase = await createSupabaseServerClient()
  
  const { data: { user } } = await supabase.auth.getUser()
  
  // Obtener reporte de la semana actual
  const { data: reporte, error } = await supabase.rpc(
    'obtener_reporte_semanal_asistencia',
    {
      p_auth_id: user.id,
      p_fecha_semana: null  // null = semana actual
    }
  )
  
  if (error) {
    console.error('Error al obtener reporte:', error)
    return <ErrorComponent />
  }
  
  return <ReporteComponent data={reporte} />
}

// Para una semana específica
const { data: reporteSemanaAnterior } = await supabase.rpc(
  'obtener_reporte_semanal_asistencia',
  {
    p_auth_id: user.id,
    p_fecha_semana: '2025-10-20'  // Cualquier día de esa semana
  }
)
```

### Ejemplo de Respuesta

```json
{
  "semana": {
    "inicio": "2025-10-26",
    "fin": "2025-11-01",
    "numero": 44
  },
  "kpis_globales": {
    "porcentaje_asistencia_global": 88.5,
    "variacion_semana_anterior": 1.2,
    "total_reuniones_registradas": 75,
    "total_grupos_con_reunion": 72
  },
  "tendencia_asistencia_global": [
    { "semana_inicio": "2025-09-07", "porcentaje": 85.0 },
    { "semana_inicio": "2025-09-14", "porcentaje": 87.3 },
    { "semana_inicio": "2025-09-21", "porcentaje": 86.8 },
    { "semana_inicio": "2025-09-28", "porcentaje": 88.1 },
    { "semana_inicio": "2025-10-05", "porcentaje": 87.5 },
    { "semana_inicio": "2025-10-12", "porcentaje": 89.2 },
    { "semana_inicio": "2025-10-19", "porcentaje": 87.3 },
    { "semana_inicio": "2025-10-26", "porcentaje": 88.5 }
  ],
  "asistencia_por_segmento": [
    {
      "id": "uuid-1",
      "nombre": "Matrimonios",
      "porcentaje_asistencia": 92.1,
      "total_reuniones": 25
    },
    {
      "id": "uuid-2",
      "nombre": "Hombres de 26 a 35",
      "porcentaje_asistencia": 85.5,
      "total_reuniones": 30
    }
  ],
  "top_5_grupos_perfectos": [
    {
      "id": "uuid-a",
      "nombre": "Cabudare Matrimonios 2",
      "lideres": "Yorjan Coa, Liliana Quijada"
    },
    {
      "id": "uuid-b",
      "nombre": "Barquisimeto Jóvenes 1",
      "lideres": "María González"
    }
  ],
  "top_5_grupos_en_riesgo": [
    {
      "id": "uuid-x",
      "nombre": "Barquisimeto Hombres 1",
      "porcentaje_asistencia": 55.0,
      "lideres": "Gabriel Salas"
    },
    {
      "id": "uuid-y",
      "nombre": "Cabudare Mujeres 3",
      "porcentaje_asistencia": 62.5,
      "lideres": "Ana Rodríguez"
    }
  ]
}
```

### Notas Técnicas

#### Cálculo de Semanas

La función utiliza el estándar domingo-sábado para definir semanas:

```sql
-- Inicio de semana (domingo)
v_fecha_inicio := p_fecha_semana - (EXTRACT(DOW FROM p_fecha_semana)::int)

-- Fin de semana (sábado)
v_fecha_fin := v_fecha_inicio + INTERVAL '6 days'
```

#### Manejo de Datos Vacíos

- Si no hay eventos en la semana, los KPIs retornan 0
- Las listas de grupos pueden estar vacías si no hay datos
- Los segmentos sin datos no aparecen en el array
- La tendencia siempre retorna 8 semanas, con 0% si no hay datos

#### Optimización de Rendimiento

La función utiliza:
- CTEs y subconsultas para organizar y compartir resultados intermedios
- Agregaciones eficientes con `FILTER (WHERE ...)`
- Índices recomendados:
  - `eventos_grupo (fecha)`
  - `director_etapa_grupos (grupo_id)`
  - `segmento_lideres (usuario_id, tipo_lider)`
- `SECURITY DEFINER` para ejecutar con permisos elevados

#### Consideraciones de Seguridad

- ✅ Validación estricta de permisos al inicio
- ✅ Filtrado automático de datos según rol
- ✅ No expone información de grupos no autorizados
- ✅ Usa `SECURITY DEFINER` de forma segura
- ✅ Previene inyección SQL con parámetros tipados

### Casos de Uso

#### 1. Dashboard Ejecutivo

```typescript
// Mostrar KPIs principales en el dashboard
const kpis = reporte.kpis_globales
console.log(`Asistencia: ${kpis.porcentaje_asistencia_global}%`)
console.log(`Tendencia: ${kpis.variacion_semana_anterior > 0 ? '↑' : '↓'} ${Math.abs(kpis.variacion_semana_anterior)}%`)
```

#### 2. Análisis de Tendencias

```typescript
// Graficar tendencia de 8 semanas
const chartData = reporte.tendencia_asistencia_global.map(item => ({
  x: new Date(item.semana_inicio),
  y: item.porcentaje
}))
```

#### 3. Intervención Pastoral

```typescript
// Identificar grupos que necesitan atención
const gruposRiesgo = reporte.top_5_grupos_en_riesgo
if (gruposRiesgo.length > 0) {
  console.log('Grupos que necesitan seguimiento:')
  gruposRiesgo.forEach(grupo => {
    console.log(`- ${grupo.nombre}: ${grupo.porcentaje_asistencia}%`)
    console.log(`  Contactar a: ${grupo.lideres}`)
  })
}
```

#### 4. Reconocimiento

```typescript
// Celebrar grupos con excelente asistencia
const gruposPerfectos = reporte.top_5_grupos_perfectos
if (gruposPerfectos.length > 0) {
  console.log('¡Grupos con 100% de asistencia! 🎉')
  gruposPerfectos.forEach(grupo => {
    console.log(`- ${grupo.nombre} (Líderes: ${grupo.lideres})`)
  })
}
```

### Errores Comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `Usuario no encontrado` | El `p_auth_id` no existe en la tabla `usuarios` | Verificar que el usuario esté registrado |
| `No tienes permisos para ver este reporte` | El rol del usuario no tiene acceso | Solo admin, pastor, director-general y director-etapa pueden acceder |
| Datos vacíos | No hay eventos registrados en la semana | Verificar que los grupos hayan registrado asistencia |

### Changelog

- **2025-10-27**: Implementación con KPIs globales, tendencias (8 semanas), análisis por segmento y top/bottom grupos. Corrección de permisos `director_etapa` usando `segmento_lideres`, reestructuración sin tablas temporales (subconsultas/CTEs) y fixes de sintaxis en CTEs/INTO.

---

## Próximas Funciones

Funciones planificadas para futuras versiones:

- `obtener_reporte_mensual_asistencia`: Reporte agregado por mes
- `obtener_reporte_comparativo_temporadas`: Comparar asistencia entre temporadas
- `obtener_reporte_crecimiento_grupos`: Análisis de crecimiento de grupos
