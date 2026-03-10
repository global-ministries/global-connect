# Arquitectura Multi-Campus

## Visión General

GlobalConnect soporta múltiples campus (sedes) geográficos, cada uno con sus propias localidades (ciudades/sectores). Esta arquitectura permite que cada campus opere de forma independiente mientras mantiene una visión global para administradores y pastores.

### Conceptos Clave

| Concepto | Descripción |
|----------|-------------|
| **Campus** | Sede principal (ej: Barquisimeto, Orlando, Madrid, Online) |
| **Localidad** | Subdivisión de un campus (ej: Barquisimeto → Barquisimeto, Cabudare) |
| **Superadmin** | Usuarios con rol `admin` o `pastor` — ven todos los campus |
| **Usuario asignado** | Cada usuario pertenece a uno o más campus vía `usuario_campus` |

---

## Modelo de Datos

### Tablas

```
campus                    ← Sedes principales
├── id (uuid, PK)
├── nombre (text)
├── codigo (text, unique)  ← Identificador corto (ej: 'BQT', 'ORL')
├── tipo (text)            ← 'ciudad' | 'pais' | 'virtual'
├── pais_id (uuid, FK)
├── ciudad_id (uuid, FK)
├── activo (boolean)
└── created_at, updated_at

campus_localidades         ← Localidades dentro de un campus
├── id (uuid, PK)
├── campus_id (uuid, FK → campus)
├── nombre (text)
├── ciudad_id (uuid, FK)
├── activo (boolean)
└── created_at

usuario_campus             ← Asignación usuario ↔ campus
├── id (uuid, PK)
├── usuario_id (uuid, FK → usuarios)
├── campus_id (uuid, FK → campus)
├── es_principal (boolean) ← Campus principal del usuario
├── rol_en_campus (text)   ← Rol específico en este campus
└── created_at

director_general_directores ← Jerarquía de supervisión
├── id (uuid, PK)
├── director_general_id (uuid, FK → usuarios)
├── director_etapa_id (uuid, FK → usuarios)
├── campus_id (uuid, FK → campus)
└── created_at
```

### Columnas Agregadas

| Tabla | Columna | Descripción |
|-------|---------|-------------|
| `grupos` | `campus_id` | Campus al que pertenece el grupo |
| `grupos` | `localidad_id` | Localidad del grupo dentro del campus |
| `segmentos` | `campus_id` | Campus del segmento |
| `segmento_lideres` | `campus_id` | Campus de la asignación líder-segmento |

### Diagrama de Relaciones

```
┌──────────┐    ┌─────────────────┐    ┌──────────────┐
│  campus   │───▶│ campus_localidades│    │   usuarios   │
└──────────┘    └─────────────────┘    └──────────────┘
     │                                       │
     │               ┌──────────────┐        │
     └──────────────▶│usuario_campus │◀───────┘
                     └──────────────┘
     │
     │    ┌──────────┐    ┌───────────────┐
     ├───▶│  grupos   │    │   segmentos   │
     │    └──────────┘    └───────────────┘
     │
     │    ┌──────────────────────────────┐
     └───▶│ director_general_directores  │
          └──────────────────────────────┘
```

---

## Helpers SQL

Tres funciones helper disponibles para RLS y RPCs:

| Función | Retorna | Uso |
|---------|---------|-----|
| `es_superadmin()` | `boolean` | `true` si el usuario tiene rol `admin` o `pastor` |
| `mis_campus_ids()` | `uuid[]` | Array de campus_id asignados al usuario autenticado |
| `mi_campus_principal()` | `uuid` | Campus principal del usuario (donde `es_principal = true`) |

---

## Políticas RLS

Las 4 tablas nuevas tienen políticas RLS activas:

### campus
- **SELECT**: Superadmins ven todos; usuarios ven solo sus campus asignados

### campus_localidades
- **SELECT**: Superadmins ven todas; usuarios ven localidades de sus campus

### usuario_campus
- **SELECT/INSERT/UPDATE/DELETE**: Superadmins tienen acceso total; usuarios ven solo sus propias asignaciones

### director_general_directores
- **SELECT**: Superadmins ven todos; directores ven sus propias relaciones

---

## RPCs con Filtro Campus

6 RPCs soportan filtro opcional por campus:

| RPC | Parámetro | Descripción |
|-----|-----------|-------------|
| `obtener_grupos_para_usuario` | `p_campus_id`, `p_localidad_id` | Filtra grupos por campus y/o localidad |
| `obtener_kpis_grupos_para_usuario` | `p_campus_id` | KPIs filtrados por campus |
| `obtener_segmentos_para_director` | `p_campus_id` | Segmentos del campus seleccionado |
| `listar_usuarios_con_permisos` | `p_campus_id` | Usuarios filtrados por campus |
| `obtener_estadisticas_usuarios_con_permisos` | `p_campus_id` | Estadísticas por campus |
| `resumen_dashboard_admin` | `p_campus_id` | Dashboard admin filtrado |

Todos los parámetros son `DEFAULT NULL` — si no se envían, retornan datos globales (retrocompatibles).

---

## Frontend

### Contexto de Campus

**Archivo**: `hooks/useCampus.tsx`

Provee un React Context con:

```typescript
interface CampusContextType {
  campusActivo: Campus | null
  localidadActiva: CampusLocalidad | null
  campusDisponibles: Campus[]
  localidadesDisponibles: CampusLocalidad[]
  campusId: string | null          // UUID del campus seleccionado
  localidadId: string | null       // UUID de la localidad seleccionada
  esSuperadmin: boolean
  loading: boolean
  seleccionarCampus: (id: string | null) => void
  seleccionarLocalidad: (id: string | null) => void
}
```

**Comportamiento**:
- Carga campus disponibles según el rol del usuario
- Superadmins ven todos los campus + opción "Todos los campus"
- Si el usuario solo tiene 1 campus, se auto-selecciona
- Persiste selección en `localStorage`
- Carga localidades dinámicamente al cambiar campus

### Selector de Campus

**Archivo**: `components/ui/selector-campus.tsx`

- Dos dropdowns: campus + localidad
- Layout vertical (stack) en sidebar desktop
- Visible solo si hay más de 1 campus o el usuario es superadmin
- Integrado en `SidebarModerna` (desktop) y `HeaderMovil` (móvil)

### Dashboard Reactivo

**Archivo**: `components/dashboard/roles/DashboardAdmin.tsx`

- Usa `useCampus()` para observar cambios de campus
- Re-fetches `resumen_dashboard_admin` con `p_campus_id` cuando cambia la selección
- Actualiza KPIs (Total Miembros, Grupos Activos) dinámicamente
- Transición de opacidad durante la carga

---

## Datos Migrados

| Dato | Cantidad |
|------|----------|
| Campus creado | 1 (Barquisimeto) |
| Localidades | 2 (Barquisimeto: 115 grupos, Cabudare: 56 grupos) |
| Grupos asignados | 171 (100% con campus_id) |
| Usuarios asignados | 1020 (100% con campus) |

---

## Jerarquía de Supervisión

```
Pastor / Admin
  └── Director General (supervisa directores de múltiples localidades)
        └── Director de Etapa (supervisa grupos de su etapa/segmento)
              └── Líder (supervisa su grupo asignado)
```

- Un director general puede supervisar directores de etapa en distintas localidades
- Los directores de etapa pueden compartir grupos (ej: matrimonios)
- Todo es configurable vía la tabla `director_general_directores`

---

## Próximos Pasos

1. Filtro por localidad en dashboard (RPCs ya lo soportan)
2. Conectar páginas de Grupos y Usuarios con `useCampus()`
3. CRUD de administración de campus y localidades
4. Onboarding para crear campus con segmentos, roles y planes
