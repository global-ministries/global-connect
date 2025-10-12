# Dashboard - Especificación Técnica Inicial

## Objetivo
Construir un dashboard global inicial (baseline) reutilizando al 100% los RPC y tablas existentes, sin modificar lógica ni contratos actuales del sistema, y luego evolucionarlo de forma incremental hacia vistas diferenciadas por rol con cambios controlados y auditables.

## Alcance (Baseline Fase 0)
- Mostrar en una única vista (misma para todos los roles) un conjunto reducido de KPIs globales NO sensibles, derivables de RPC existentes:
	- Total usuarios visibles según permiso (usando `listar_usuarios_con_permisos` + paginación mínima / conteo total)
	- Total grupos (consulta directa tabla `grupos` con RLS existente) si el usuario ya puede ver grupos (verifica permiso actual sin nuevo RPC)
	- Usuarios registrados hoy (derivable de `obtener_estadisticas_usuarios_con_permisos`)
	- % usuarios con email y % con teléfono (misma fuente de estadísticas)
- Mostrar roles del usuario (hook `useCurrentUser`).
- NO segmentar todavía por rol; todos ven la misma disposición (algunos KPIs podrían salir en blanco si el RLS les oculta datos, se mostrará fallback "No disponible").
- No incluye etapas, tendencias, ni agrupaciones avanzadas.

## Roles Identificados
Roles de sistema (`roles_sistema.nombre_interno`):
- `admin`
- `pastor`
- `director-general`
- `director-etapa`
- `lider`
- `miembro`

Roles en contexto de grupo (`grupo_miembros.rol` enum_rol_grupo): `Líder`, `Colíder`, `Miembro`.

## Evolución de Bloques (Plan Futuro)
| Fase | Bloque / Cambio | Descripción | Fuente Datos | Riesgo |
|------|------------------|-------------|--------------|--------|
| 0 | baseline-global | KPIs neutrales (usuarios, grupos, % email/teléfono, registrados hoy) | RPC existentes | Bajo |
| 1 | separación por rol | Ajustar layout condicional (ocultar cards vacías) sin nuevo RPC | mismos RPC | Muy bajo |
| 2 | mis_grupos | Añadir sección para líderes (derivado de joins `grupo_miembros`) con nuevo componente (sin nuevo RPC aún) | tablas directas + RLS | Medio |
| 3 | etapas | Primera versión bloque etapas para roles director-* (posible nuevo RPC específico) | nuevo RPC | Medio |
| 4 | optimización | Unificar en un RPC agregador opcional si latencia crece | consolidado | Medio |
| 5 | tendencias | Series temporales (views/materialized) | vistas/materialized | Alto |

## Métricas (Fase 0 - Baseline)
Obtenidas sin crear nuevas funciones:
- total_usuarios (campo `total_count` de `listar_usuarios_con_permisos` primera página).
- con_email / con_telefono / registrados_hoy (desde `obtener_estadisticas_usuarios_con_permisos`).
- total_grupos (SELECT COUNT(*) FROM grupos) — se mostrará si resultado > 0, fallback "No autorizado" si error RLS.

Derivados simples:
- porcentaje_con_email = con_email / total_usuarios (si total_usuarios > 0).
- porcentaje_con_telefono = con_telefono / total_usuarios.

No incluimos todavía "miembros en grupo" ni distribución roles para evitar sobrecarga inicial.

## Arquitectura de Datos Fase 0
Sin nuevos RPC. Se combinan llamadas existentes en el cliente (o en un server component wrapper):
1. `listar_usuarios_con_permisos` (p_limite = 1) para leer `total_count` y evitar payload grande.
2. `obtener_estadisticas_usuarios_con_permisos` con mismos filtros (vacíos) para KPIs rápidos.
3. Conteo de grupos: Server component o acción server que hace `SELECT COUNT(*) FROM grupos` (en caso de error RLS -> null).

Optimización futura (Fases 4+): consolidar en un solo RPC si el número de round-trips (3) impacta TTFB.

## Seguridad
- No se altera el modelo existente ni se añaden nuevos permisos en Fase 0.
- Se reutiliza RLS ya aplicado sobre tablas y funciones.
- Manejo de errores: cada bloque se renderiza con fallback si la consulta devuelve error (no bloquear dashboard completo).

## Performance y Escalabilidad (Baseline)
- Round-trips iniciales: 2 (RPC stats + RPC listar con límite 1) + 1 opcional (conteo grupos). Aceptable.
- Index coverage ya existente (ver migraciones de performance) -> no se requieren índices nuevos.
- Evitar overfetch: limitar listar a p_limite=1 solo para total.
- Telemetría futura: medir tiempo combinado y evaluar consolidación.

## Iteraciones Futuras
| Iteración | Enfoque | Detalle |
|-----------|---------|---------|
| 2 | Etapas | Popular bloque `etapas.resumen` con KPIs de segmentación. |
| 3 | Tendencias | Métricas temporales (últimas 8 semanas). |
| 4 | Retención | Cálculo de retención de miembros y asistencia. |
| 5 | Alertas | Flags de anomalías (descenso brusco, grupos inactivos). |

## Endpoints Planeados
- `GET /api/dashboard/metrics` (único para Iteración 1).

## Hook Frontend Planeado
`useDashboardMetrics()`:
- SWR/React Query (por ahora simple fetch) → retorna `{ data, loading, error }`.
- Revalidación bajo demanda (botón “Refrescar”).

## Componentes UI (Skeleton)
- `<DashboardGlobalStats />`
- `<DashboardMisGrupos />`
- `<DashboardPersonal />`
- `<DashboardEtapas />` (placeholder)

## Convenciones de Nombres
- Claves JSON: snake_case internas; mapping a camelCase en front opcional.
- Roles siempre comparados en minúscula `nombre_interno`.

## Plan de Implementación (Fases)
Fase 0 (baseline):
1. Rama `feature/dashboard-baseline`.
2. Crear server util o hook `useDashboardBaseline()` que dispare las 2+1 queries en paralelo.
3. Componente `<DashboardBaseline />` con cards simples y skeleton.
4. Fallbacks semánticos: "No autorizado" / "N/D".
5. Pruebas manuales con diferentes roles usando debug bar.
6. Documentar resultados y medir tiempos (console.time en dev).

Fase 1 (ajuste por rol, sin nuevos RPC):
1. Condicionar visibilidad de cards (admin/pastor/director-general ven todas; miembro solo básicas).
2. Agregar mensaje contextual según rol.

Fase 2 (mis_grupos para líderes):
1. Añadir consulta adicional (SELECT grupos donde lider/colíder) + conteos.
2. Mostrar sección colapsable.

Fase 3 (etapas):
1. Diseñar RPC específico `obtener_dashboard_etapas` (opcional) o reusar consultas directas.
2. Evaluar costo antes de fusionar en agregador.

Fase 4 (unificación opcional):
1. Crear RPC agregador solo si medición > umbral latencia.
2. Mantener versión baseline como fallback si falla agregador.

Fase 5 (tendencias y gráficos):
1. Introducir vistas/materialized para series.
2. Añadir capa de invalidación.

## Smoke Test (Baseline)
```
1. Iniciar sesión como admin -> cards muestran números (>0 normalmente).
2. Iniciar sesión como líder -> mismos KPIs (números pueden ser subset por RLS pero visibles).
3. Iniciar sesión como miembro -> totales pueden reducirse a su scope (no error UI).
4. Forzar error (desconectar red) -> UI muestra skeleton luego fallbacks parciales.
```

## Checklist de Calidad
- [ ] RPC sin uso de SELECT *.
- [ ] Comentarios descriptivos en migración.
- [ ] Tamaño de respuesta < 25KB.
- [ ] Endpoint maneja errores y no filtra stack.
- [ ] Hook maneja loading+error states.
- [ ] No datos sensibles en bloques no autorizados.

## Riesgos / Mitigaciones
- Carga creciente de conteos: usar caching futuro (pgcache / redis) si P95 sube.
- Agregados pesados al crecer datos: migrar a vistas materializadas.
- Cambios de roles en sesión existente: forzar refetch tras evento de cambio de roles (debug bar / panel perfil).

## Decisiones Abiertas
- Incluir o no bloque `etapas` para admin/pastor (revisar UX en Iteración 2).
- Estructura futura para gráficas (posible endpoint separado si payload crece >50KB).

---
Este documento se versionará con cada incremento relevante. Mantenerlo conciso y sincronizado con el estado real del código.
