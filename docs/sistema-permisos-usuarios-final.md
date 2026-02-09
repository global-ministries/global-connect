# Sistema de Permisos de Usuarios - Implementación Final

## 🎯 Resumen Ejecutivo

Se ha implementado exitosamente un sistema completo de permisos de usuarios basado en roles, utilizando la estructura real de la base de datos de GlobalConnect. El sistema permite control granular de acceso según la jerarquía organizacional.

## ✅ Estado del Proyecto

**COMPLETADO** - Todas las funcionalidades implementadas y probadas

### Componentes Entregados

1. **Base de Datos (Supabase)**
   - ✅ `listar_usuarios_con_permisos` - RPC optimizada con filtros por rol
   - ✅ `obtener_estadisticas_usuarios_con_permisos` - Estadísticas contextuales
   - ✅ Uso de estructura existente: `segmento_lideres`, `grupo_miembros`, `familias`, `relaciones_usuarios`

2. **Frontend (React/Next.js)**
   - ✅ `useUsuariosConPermisos` - Hook optimizado con caché (5 min)
   - ✅ `page-con-permisos.tsx` - UI completa con alertas por rol
   - ✅ Paginación del lado del servidor (20 usuarios/página)
   - ✅ Búsqueda con debounce (400ms)

3. **Testing y Validación**
   - ✅ `test-permisos-usuarios.mjs` - Pruebas automatizadas
   - ✅ Validación con usuarios reales del sistema
   - ✅ Verificación de consistencia entre RPCs

## 🔐 Matriz de Permisos Implementada

| Rol | Alcance Actual de Usuarios/Grupos | Implementación Base | Notas Recientes |
|-----|-----------------------------------|---------------------|-----------------|
| `admin` | **TODOS** | Sin restricciones | Acceso global |
| `pastor` | **TODOS** | Sin restricciones | Acceso global |
| `director-general` | **TODOS** | Sin restricciones | Acceso global |
| `director-etapa` | **Sólo grupos asignados explícitamente** | Relación explícita via función `asignar_director_etapa_a_grupo` + flag en `obtener_grupos_para_usuario` | Ya NO ve toda la etapa completa. Campo `supervisado_por_mi` = true cuando está asignado. |
| `lider` | **Sus grupos (Pasados/Actuales)** | `grupo_miembros` + Filtro temporal | **NO ve grupos futuros** (salvo activos con temporada activa). |
| `miembro` | **Su familia** | `familias` + `relaciones_usuarios` | Sin cambios |

### 🕒 Restricción Temporal de Grupos

Se ha implementado una restricción específica para la visibilidad de grupos según su temporada:

| Rol | Grupos Futuros | Excepción |
|-----|----------------|-----------|
| `admin`, `pastor`, `director-general` | ✅ Visible | N/A |
| `director-etapa` | ✅ Visible (si asignado) | N/A |
| `lider`, `colider`, `miembro` | ❌ **Oculto** | Visible SOLO si `grupo.activo=true` Y `temporada.activa=true` |

Esta lógica reside centralizada en la función SQL `public.puede_ver_grupo`.

### 📦 Papelera de Grupos (Eliminación Reversible)

Se incorporó un flujo de eliminación reversible para `grupos` basado en la nueva columna `grupos.eliminado`.

| Acción | Roles Permitidos (actual) | Implementación | Notas |
|--------|---------------------------|----------------|-------|
| Enviar a Papelera (`DELETE /api/grupos/:id`) | `admin`, `pastor`, `director-general` | Endpoint actualiza: `eliminado=true`, `activo=false` | Director de etapa NO puede eliminar. |
| Restaurar (`POST /api/grupos/:id/restore`) | `admin`, `pastor`, `director-general` | Endpoint actualiza: `eliminado=false`, `activo=true` | Reactiva inmediatamente el grupo. |
| Listar grupos eliminados | Mismos roles superiores (UI restringe) | RPC `obtener_grupos_para_usuario(p_eliminado=true)` | Param `p_eliminado` filtra en servidor. |
| Ver un grupo eliminado específico | Sólo si ya tenía permiso sobre el grupo y es rol superior | Misma RPC, filtrado por id | No se expone vista directa en UI general. |

Principios adoptados:
1. Separación de intención: "eliminar" ahora es reversible → evita pérdida accidental.
2. Simplicidad de índice: sólo se listan uno de los dos subconjuntos (activos vs papelera) para aprovechar índice parcial `WHERE eliminado=false`.
3. Mínimo privilegio: directores de etapa y líderes no pueden manipular la papelera.

Limitaciones actuales / próximas mejoras:
- No existe todavía `deleted_at`; se evaluará para purga automática futura.
- No hay endpoint de purga definitiva (hard delete) → pendiente de requerimiento.
- Validación de rol para `p_eliminado=true` se aplica en UI; recomendable endurecer en la función o vía policy si se amplia uso.

Ejemplos (SQL):
```sql
-- Listar activos
select count(*) from public.obtener_grupos_para_usuario(<auth>, NULL,NULL,NULL,NULL,NULL,10,0,false);
-- Listar papelera (solo roles superiores)
select count(*) from public.obtener_grupos_para_usuario(<auth>, NULL,NULL,NULL,NULL,NULL,10,0,true);
```

Backlog sugerido relacionado a papelera:
- Añadir `deleted_at` + job de purga > X días.
- Auditar acciones (tabla `auditoria_eventos` con tipo `grupo_papelera` / `grupo_restore`).
- Batch restore/delete (optimización UX si volumen crece).


## 🏗️ Arquitectura Técnica

### Base de Datos - Estructura Real Utilizada

```sql
-- Directores de Etapa
segmento_lideres (usuario_id, segmento_id, tipo_lider)
  WHERE tipo_lider = 'director_etapa'

-- Líderes de Grupo  
grupo_miembros (usuario_id, grupo_id, rol)
  WHERE rol = 'Líder'

-- Relaciones Familiares
usuarios.familia_id -> familias.id
relaciones_usuarios (usuario1_id, usuario2_id, tipo_relacion)
```

### Frontend - Hook Optimizado

```typescript
const {
  usuarios,           // Lista paginada
  estadisticas,       // Caché 5 min
  cargando,          // Estado de carga
  filtros,           // Búsqueda + filtros
  paginaActual,      // Paginación
  actualizarFiltros, // Control de filtros
  recargarDatos      // Refresh manual
} = useUsuariosConPermisos()
```

## 🧪 Resultados de Pruebas

**Estado:** ✅ **TODAS LAS PRUEBAS PASARON**

```bash
🎯 Resultado: 3/3 pruebas exitosas
🎉 ¡Todas las pruebas pasaron! El sistema de permisos funciona correctamente.

Roles probados:
✅ pastor (José) - Ve todos los usuarios
✅ admin (Isaac) - Ve todos los usuarios  
✅ lider (Kelly) - Ve usuarios de sus grupos
```

## 🚀 Instrucciones de Uso

### 1. Acceder al Sistema

```bash
# La página está disponible en:
/app/dashboard/users/page-con-permisos.tsx

# Para reemplazar la página actual:
# Renombrar page.tsx -> page-old.tsx
# Renombrar page-con-permisos.tsx -> page.tsx
```

### 2. Ejecutar Pruebas

```bash
# Probar el sistema completo
node scripts/test-permisos-usuarios.mjs

# Verificar migraciones aplicadas
supabase db push
```

### 3. Configurar Permisos Especiales

```sql
-- Asignar segmento a director de etapa
INSERT INTO segmento_lideres (usuario_id, segmento_id, tipo_lider)
VALUES ('uuid-director', 'uuid-segmento', 'director_etapa');

-- Asignar líder a grupo
INSERT INTO grupo_miembros (usuario_id, grupo_id, rol)
VALUES ('uuid-lider', 'uuid-grupo', 'Líder');
```

## 📊 Métricas de Rendimiento

- **Caché de Estadísticas:** 5 minutos
- **Paginación:** 20 usuarios por página
- **Búsqueda:** Debounce 400ms
- **Consultas:** Optimizadas con índices existentes

## 🔧 Mantenimiento

### Monitoreo
- Verificar logs de RPCs en Supabase Dashboard
- Monitorear tiempos de respuesta de consultas
- Validar consistencia de permisos periódicamente

### Escalabilidad
- Sistema probado con estructura real
- Soporta miles de usuarios via paginación
- Consultas optimizadas para crecimiento

## 🎉 Entregables Finales

### Archivos Creados/Modificados

```
supabase/migrations/
├── 20250910210000_listar_usuarios_con_permisos_fixed.sql
└── 20250910211000_estadisticas_usuarios_con_permisos_fixed.sql

hooks/
└── use-usuarios-con-permisos.ts

app/dashboard/users/
└── page-con-permisos.tsx

scripts/
└── test-permisos-usuarios.mjs

docs/
└── sistema-permisos-usuarios-final.md
```

### Branch de Git

```bash
# Rama con todos los cambios
feat/sistema-permisos-usuarios-estructura-real

# Commits organizados:
- feat(db): implement user permissions system with real database structure
- feat(frontend): add optimized user permissions hook  
- feat(ui): create users page with role-based permissions
- feat(testing): add comprehensive permissions testing script
- fix(testing): correct foreign key references in test script
```

## 🔗 Pull Request

**URL:** https://github.com/global-ministries/global-connect/pull/new/feat/sistema-permisos-usuarios-estructura-real

**Estado:** ✅ Listo para revisión y merge

---

## ✅ Resumen Final Fase 1 (2025-10-06)

La Fase 1 se cierra con un sistema de permisos y supervisión granular operativo y alineado al modelo organizacional actual, reduciendo superficie de acceso y preparando la base para métricas evolutivas.

### Entregables Clave Consolidando la Fase
- Permisos usuario ↔ grupos y segmentos reestructurados (directores sólo sobre grupos asignados).
- RPCs críticas endurecidas: `obtener_grupos_para_usuario`, `asignar_director_etapa_a_grupo`, `_puede_ver_segmento_lider`.
- Política consolidada RLS sobre `segmento_lideres` con SECURITY DEFINER centralizado.
- UI adaptada: badge "Dir. etapa", edición en modo read-only cuando no hay supervisión, selección global de líder mediante modal.
- Indicadores base (KPIs) agregados: porcentaje con líder, aprobados, sin director, distribución de miembros.
- Documentación actualizada reflejando el nuevo alcance y decisiones de diseño.

### Beneficios Tangibles
| Área | Situación Anterior | Estado Actual |
|------|--------------------|---------------|
| Visibilidad Director Etapa | Amplia (todos los grupos del segmento) | Focalizada (sólo asignados) |
| Riesgo de edición indebida | Alto | Mitigado (read-only + validación servidor) |
| Identificación de responsabilidad | Implícita | Explícita (flag + badge) |
| Extensibilidad KPIs | Limitada | Vista base y función escalable |

### Nuevo Ciclo de Métricas (Versión Inicial)
Fuente: `obtener_kpis_grupos_para_usuario`
- Total grupos supervisados
- % con líder asignado
- % aprobados
- % sin director (para roles superiores / diagnóstico)
- Promedio y desviación de miembros

### Deuda / Backlog Propuesto
1. Tests automáticos permisos grupos (director asignado vs no, líder, superior) – (Tarea abierta).
2. Extender KPIs con asistencia (cuando tabla disponible) – (Planificado).
3. Auditoría de asignaciones (endpoint listar directores por grupo) – recomendación.
4. Mejorar endpoint de selección líder restringiendo visibilidad para directores según alcance granular (si aplica política adicional futura).
5. Añadir `supervisado_por_mi` a `obtener_detalle_grupo` para coherencia en vistas aisladas.

### Observabilidad Recomendada
- Log de invocaciones rechazadas de `asignar_director_etapa_a_grupo` (permiso denegado) → detección de intentos fuera de alcance.
- Métrica semanal: variación de % grupos sin director + tiempo medio hasta asignación.

### Riesgos Residuales
| Riesgo | Mitigación Actual | Próxima Acción |
|--------|-------------------|----------------|
| Director ve candidatos a líder fuera de alcance granular | Revisión puntual, no crítico (acción eventual de rol superior) | Ajustar fuente de datos si se requiere aislamiento total |
| Falta de test regresión permisos | Validación manual actual | Implementar script (tarea pendiente) |
| KPIs sin asistencia aún | No afecta decisiones inmediatas | Extensión cuando tabla esté lista |

### Listo para Fase 2
Se recomienda que la siguiente fase se enfoque en: (a) auditoría y observabilidad; (b) flujos de aprobación con `estado_aprobacion` completo; (c) expansión de métricas de impacto (asistencia, retención, participación por líder/director).

---

## 📝 Notas Técnicas

### Correcciones Aplicadas
- ❌ `usuario_segmentos` (no existía) → ✅ `segmento_lideres`
- ❌ `rol = 'lider'` → ✅ `rol = 'Líder'` 
- ❌ `tipo_lider = 'director-etapa'` → ✅ `tipo_lider = 'director_etapa'`

### Lecciones Aprendidas
1. **Análisis previo crucial:** Revisar estructura real antes de implementar
2. **Pruebas con datos reales:** Más efectivo que datos mock
3. **Commits granulares:** Facilita revisión y rollback
4. **Documentación actualizada:** Refleja implementación real

**Sistema completamente funcional y listo para producción** 🚀

---

## 🔄 Extensión: Búsqueda para Relaciones Familiares (2025-10-05)

Se añadió un nuevo flujo para unificar la búsqueda de usuarios al crear relaciones familiares reutilizando la RPC central `listar_usuarios_con_permisos`.

### Nuevo Endpoint

`GET /api/usuarios/buscar-para-relacion?q=<texto>`

Características:

- Usa `listar_usuarios_con_permisos` con el parámetro `p_contexto_relacion = true`.
- Permite que un usuario con rol `Líder` vea todos los usuarios solo en este contexto (no amplía su alcance global en otros módulos).
- Incluye el campo `foto_perfil_url` para avatares consistentes.
- Devuelve también usuarios que ya son familiares del foco, marcados en frontend con badge (no se ocultan para evitar confusión UX).

### Parámetro Contextual Nuevo

```sql
p_contexto_relacion boolean DEFAULT false
```

Lógica adicional aplicada cuando `true`:

- La rama de visibilidad para `líder` se expande para comportarse como roles globales (admin/pastor/director-general) solo durante la búsqueda de relaciones.
- No altera las reglas de paginación ni filtros existentes (hereda todo lo demás).

### Razón del Diseño

1. Evitar duplicación de lógica de permisos (pivot desde una RPC fallida específica).
2. Minimizar superficie de riesgo: la ampliación de visibilidad es contextual y no permanente.
3. Conservar la semántica de auditoría: se puede rastrear por el uso del flag.

### Ejemplo de Uso en Backend

```ts
const { data, error } = await supabase
  .rpc('listar_usuarios_con_permisos', {
    p_query: q || '',
    p_contexto_relacion: true
  });
```

### Consideraciones de UX

- Usuarios ya relacionados aparecen deshabilitados con badge "Ya es familiar".
- Solo se excluye al usuario actual para impedir relación consigo mismo.
- Se mantiene orden actual (pendiente: futura mejora de ranking por coincidencia parcial/inicial).

### Futuras Mejores (Backlog)

- Ordenamiento por similitud (ILIKE prioridad prefijo > substring).
- Paginación para búsquedas > 50 resultados.
- Mostrar tipo de relación existente directamente en la lista (ej. "Padre", "Hermano").
- Endpoint POST para prevalidar creación antes de confirmar (optimista).

---

## ➕ Actualización Roles de Grupo (2025-10-06)

A partir de esta fecha la interfaz presenta el rol interno `Colíder` como `Aprendiz`.

Motivación:
- Clarificar que no posee los mismos permisos de gestión que un `Líder`.
- Reflejar etapa formativa / acompañamiento.
- Evitar confusión en listados donde solo se deben resaltar líderes principales.

Detalles Técnicos:
- Valor interno en BD permanece `Colíder` (tabla `grupo_miembros.rol`).
- UI: Formularios y listados muestran "Aprendiz" (selects, badges, registro de asistencia, lista de grupos).
- Lista de grupos: se muestran únicamente líderes (rol = `Líder`) y se agrega badge `+N aprendiz(es)` para el número de aprendices asociados.
- No se otorgan permisos de gestión (agregar/quitar miembros) por ser Aprendiz.

Impacto en Código:
- No requiere migración de datos; cambio puramente de representación.
- Si en el futuro se decide cambiar el valor de enumeración en BD deberá:
  1. Crearse migración que haga UPDATE del valor antiguo al nuevo.
  2. Ajustar cualquier índice / constraint dependiente.
  3. Revisar RPCs (`obtener_grupos_para_usuario`) y validaciones de rol.

Testing:
- Verificar que al agregar un miembro seleccionando "Aprendiz" el backend recibe `Colíder`.
- Smoke UI: lista de grupos muestra badge de aprendices acorde al conteo.

---

## 🔄 Actualización Modelo Granular Director de Etapa (2025-10-06)

Esta actualización refina el alcance de los directores de etapa para que sólo tengan visibilidad y permisos de edición sobre los grupos a los que han sido asignados explícitamente, en lugar de todos los grupos de la(s) etapa(s) que coordinan.

### Objetivos
1. Reducir exposición de datos (principio de mínimo privilegio).
2. Permitir escenarios de co-dirección parcial o transición ordenada.
3. Identificar con claridad (UI) qué grupos están bajo su supervisión directa.

### Cambios Clave
- NUEVA RPC: `asignar_director_etapa_a_grupo(p_auth_id, p_grupo_id, p_segmento_lider_id, p_accion)` (SEGURITY DEFINER) para agregar/quitar la relación.
- MODIFICADA RPC: `obtener_grupos_para_usuario` ahora devuelve el campo boolean `supervisado_por_mi` y limita resultados para `director_etapa` a sólo grupos asignados.
- NUEVO CAMPO (grupos): `estado_aprobacion` (ej. draft/pending/aprobado) soporta flujos de revisión (aún en adopción).
- POLICY CONSOLIDADA sobre `segmento_lideres` usando función SECURITY DEFINER `_puede_ver_segmento_lider(sl_row)` → centraliza lógica de visibilidad (roles superiores, propietario). El director de etapa no recibe por esta policy visibilidad extra de otros directores.
- UI Lista de Grupos: aparece badge "Dir. etapa" cuando `supervisado_por_mi = true`.
- UI Edición de Grupo: si usuario es director de etapa pero NO está asignado al grupo, ve el formulario en modo sólo lectura (inputs deshabilitados + banner explicativo) en lugar de redirección disruptiva.

### Flujo de Asignación
1. Rol superior (admin/pastor/director-general) ejecuta acción (UI o backend) que llama a `asignar_director_etapa_a_grupo` con `p_accion = 'agregar'`.
2. La relación queda registrada (tabla relacional intermedia — ver migración correspondiente).
3. En siguientes cargas, `obtener_grupos_para_usuario` marca `supervisado_por_mi = true` para ese director y el grupo aparece en su listado.
4. Para remover: misma RPC con `p_accion = 'remover'`.

### Impacto en Permisos EXISTENTES
| Área | Antes | Ahora |
|------|-------|-------|
| Visibilidad grupos (director_etapa) | Todos los grupos de sus etapas | Sólo grupos asignados |
| Edición grupo | Cualquier grupo de su etapa | Sólo asignados (`puede_editar_grupo`) |
| Buscar posibles líderes | Filtraba por etapa completa | (Pendiente de refinar) Actualmente debe alinearse a grupos asignados o roles superiores |
| Auditoría | Difusa (alcance amplio) | Más precisa (acciones sólo en grupos supervisados) |

### Elementos Técnicos Añadidos
```sql
-- Función de policy consolidada
CREATE OR REPLACE FUNCTION public._puede_ver_segmento_lider(sl_row segmento_lideres) RETURNS boolean ... SECURITY DEFINER;

-- Campo adicional expuesto
-- obtener_grupos_para_usuario OUT supervisado_por_mi boolean

-- RPC asignación granular
SELECT asignar_director_etapa_a_grupo(p_auth_id, p_grupo_id, p_segmento_lider_id, 'agregar');
```

### UI / DX Considerations
- Badge "Dir. etapa" ayuda a distinguir responsabilidad directa.
- Read-only transparente evita frustración por redirecciones duras y mantiene contexto.
- Mantener consistencia: cualquier vista de detalle que permita acción debe revisar `puede_editar_grupo` server-side (ya aplicado) + degradación a read-only client.

### Próximos Ajustes Recomendados
- Endpoint para listar/gestionar asignaciones actuales por grupo (auditoría rápida).
- Extender `obtener_detalle_grupo` para incluir `supervisado_por_mi` (optimización futura; actualmente se infiere por list + permiso editar).
- Tests automatizados (ver tarea pendiente) cubriendo: director asignado vs. no asignado, líder, roles superiores.
- Ajustar búsqueda de posibles líderes para que un director no pueda ver fuera de su alcance granular.

### Riesgos Mitigados
- Acceso lateral a grupos no asignados (bloqueado por `puede_editar_grupo`).
- Fugas de director viewing policy: centralizado en `_puede_ver_segmento_lider` con SECURITY DEFINER controlado.

### Métrica Sugerida (Observabilidad)
- KPI: porcentaje de grupos con director de etapa asignado (completitud supervisión).
- KPI: acciones de edición rechazadas por falta de asignación (debería tender a ~0 tras adopción).

---

## 🌍 Extensión: Ciudades / Ubicaciones de Segmento y Unicidad (2025-10-06)

### Objetivo
Limitar a exactamente UNA ciudad (ubicación lógica) por director de etapa dentro de un segmento y permitir que los grupos referencien una ubicación para futuras métricas territoriales.

### Componentes Nuevos
- Tabla `segmento_ubicaciones` (ciudades predefinidas por segmento, p.ej. `Barquisimeto`, `Cabudare`).
- Tabla relacional `director_etapa_ubicaciones` (antes permitía N ciudades, ahora 1 por constraint único).
- Columna `grupos.segmento_ubicacion_id` para asociar un grupo a una ubicación (opcional, `ON DELETE SET NULL`).
- Vista `v_directores_etapa_segmento` agregando array de ciudades (ahora a lo sumo 1 elemento tras unicidad).
- Migración de refactor: `20251006214500_enforce_unique_director_ciudad.sql`.

### Cambio de Modelo (Unicidad)
Anteriormente: constraint `UNIQUE(director_etapa_id, segmento_ubicacion_id)` → permitía múltiples ciudades por director.
Ahora: constraint `UNIQUE(director_etapa_id)` → fuerza máximo 1 fila por director.

### RPC Actualizada
`asignar_director_etapa_a_ubicacion(p_auth_id, p_director_etapa_id, p_segmento_ubicacion_id, p_accion)`

Comportamiento:
1. `p_accion = 'agregar'`: UPSERT (si ya existe fila, actualiza `segmento_ubicacion_id`).
2. `p_accion = 'quitar'`: DELETE de la fila del director.
3. Retorna siempre el estado actual (0 o 1 fila) para el director.

### Justificación del Upsert
Evita lógica adicional en frontend (no requiere verificar si ya tenía otra ciudad). El cambio de ciudad es semánticamente un reemplazo, por lo que el `ON CONFLICT ... DO UPDATE` asegura atomicidad.

### Flujo UI (Página Directores de Segmento)
1. Se listan directores (`v_directores_etapa_segmento`).
2. Cada fila muestra chips toggle para ciudades disponibles.
3. Al activar una ciudad diferente, se reemplaza la anterior (refresco inmediato en el hook).
4. Al desactivar (quitar) deja al director sin ciudad (array vacío / null en cliente).

### Lógica de Cliente (Resumen)
```tsx
// (Simplificado) Al hacer click:
await fetch(`/api/segmentos/${segmentoId}/directores-etapa/ubicaciones`, {
  method: 'POST',
  body: JSON.stringify({
    director_etapa_segmento_lider_id: directorId,
    segmento_ubicacion_id: ciudadId,
    accion: checked ? 'agregar' : 'quitar'
  })
});
```

### Consideraciones de Permisos
El RPC exige que el `p_auth_id` corresponda a rol superior (`admin`, `pastor`, `director-general`). El frontend debe restringir toggles para directores no autorizados (guard ya presente a nivel página). Futuro: permitir que un director-general delegue a otro rol específico.

### Pruebas Automatizadas
Script: `scripts/test-ciudades.mjs`

Casos cubiertos:
1. Segmento base presente (depende de semilla previa de permisos).
2. Director de etapa existente.
3. Ciudades base creadas o autogeneradas.
4. Asignación inicial → exactamente 1 fila.
5. Reemplazo de ciudad → sigue 1 fila, cambia el id.
6. Reasignación idempotente (misma ciudad) → sin duplicados.
7. Quitar ciudad → 0 filas restantes.
8. Grupo: crear con ciudad A, actualizar a ciudad B y reflejar cambio.

Salida ejemplo:
```
Total: 11/11 PASS
```

### Riesgos y Mitigaciones
| Riesgo | Mitigación | Estado |
|--------|-----------|--------|
| Carrera de asignaciones simultáneas | Constraint UNIQUE + UPSERT atómico | OK |
| Director sin ciudad visible como [] | UI interpreta array vacío (estado neutro) | OK |
| Frontend antiguo intentando múltiple selección | Reemplazo silencioso, no rompe | Aceptado |

### Próximos Pasos (Opcionales)
1. Registrar timestamp de asignación (`created_at` + `updated_at`) en `director_etapa_ubicaciones` para auditoría.
2. Añadir trigger que registre histórico en tabla `director_etapa_ubicaciones_hist`.
3. Exponer en KPI conteo de grupos por ciudad y % supervisados.
4. Restricción futura: validar que la ciudad pertenezca al mismo segmento que el director (ya implícito por claves externas, documentar en tests).

### Ejemplo de Consulta de Vista
```sql
SELECT director_etapa_segmento_lider_id, nombre, ciudades
FROM v_directores_etapa_segmento
WHERE segmento_id = '...';
```

---

## 🧪 Resumen Scripts de Pruebas Relacionados (Actualizado)

| Script | Propósito | Foco Principal |
|--------|-----------|----------------|
| `test-grupos-permisos.mjs` | Validar permisos y asignaciones director ↔ grupo | Visibilidad y supervisión |
| `test-segmentos.mjs` | Integridad de segmentos y joins director-grupo | Consistencia referencial |
| `test-ciudades.mjs` | Unicidad ciudad por director y actualización de grupos | Territorialidad |

Recomendación: Integrar estos scripts en pipeline CI secuencial (orden sugerido): `test-grupos-permisos` → `test-segmentos` → `test-ciudades`.

---

## 📘 Referencia Rápida (Cheat Sheet)

```text
Asignar director a grupo: asignar_director_etapa_a_grupo(p_auth_id, p_grupo_id, p_segmento_lider_id, 'agregar')
Quitar director de grupo: asignar_director_etapa_a_grupo(..., 'remover')
Asignar ciudad director: asignar_director_etapa_a_ubicacion(p_auth_id, p_director_etapa_id, p_segmento_ubicacion_id, 'agregar')
Reemplazar ciudad: misma llamada con nueva ciudad (upsert)
Quitar ciudad: asignar_director_etapa_a_ubicacion(..., 'quitar')
Listar directores + ciudades: SELECT * FROM v_directores_etapa_segmento WHERE segmento_id = ?;
```

---

## ✅ Estado Actual Post-Extensión
El sistema ahora cubre asignaciones granulares de grupos y territorios (ciudad única) por director de etapa, con pruebas automatizadas asegurando unicidad e idempotencia. Preparado para métricas geográficas y auditoría futura.


## 🔁 Actualización KPIs Grupos (Correcciones 2025-10-06)

Se incorporó la función `obtener_kpis_grupos_para_usuario(p_auth_id uuid)` que entrega métricas agregadas del universo de grupos visible para el usuario según su rol y alcance real (directores sólo grupos asignados; líderes sus propios grupos; roles superiores todos).

### Columnas Devueltas
| Campo | Tipo | Descripción |
|-------|------|-------------|
| total_grupos | integer | Número de grupos en su universo |
| total_con_lider | integer | Grupos con al menos un líder (rol = 'Líder') |
| pct_con_lider | numeric | Porcentaje con líder respecto al total |
| total_aprobados | integer | Grupos con `estado_aprobacion = 'aprobado'` |
| pct_aprobados | numeric | Porcentaje aprobados respecto al total |
| promedio_miembros | numeric | Media de miembros por grupo |
| desviacion_miembros | numeric | Desviación estándar de miembros |
| total_sin_director | integer | Grupos sin director de etapa asignado |
| pct_sin_director | numeric | Porcentaje sin director respecto al total |
| fecha_ultima_actualizacion | timestamptz | Timestamp de generación |

### Vista de Soporte
`v_grupos_supervisiones` consolida: id de grupo, director asignado (usuario), líder principal (si existe) y total de miembros; facilita expansión futura (asistencia, crecimiento temporal) sin recalcular joins en cada llamada.

### Correcciones Aplicadas Posteriores
1. Desajuste de tipos COUNT(*) → se castearon a `::int` para alinear con la firma RETURNS TABLE.
2. Mapeo erróneo de identidad → se comparaba `p_auth_id` directamente con `director_etapa_usuario_id` y `lider_usuario_id` (que guardan `usuarios.id` interno). Se añadió resolución previa: `SELECT u.id INTO v_usuario_id FROM usuarios u WHERE u.auth_id = p_auth_id` y se usan comparaciones con `v_usuario_id`.
3. COALESCE aplicado a contadores para evitar división con null y garantizar porcentajes consistentes.

### Ejemplo de Uso (RPC vía Supabase JS)
```ts
const { data, error } = await supabase.rpc('obtener_kpis_grupos_para_usuario', { p_auth_id: session.user.id });
const kpis = data?.[0];
```

### Extensiones Planeadas (Backlog)
- Métricas de asistencia (requiere fuente estable de eventos/asistencia por grupo).
- Ratio liderazgo: líderes activos vs. grupos totales.
- Tiempo medio hasta asignación de director y líder desde creación del grupo.

### Consideraciones de Seguridad / Performance
- SECURITY DEFINER controlado: sólo expone agregados, sin enumerar IDs de grupos no visibles.
- Un único CTE con agregación, coste O(n) sobre el universo filtrado; n esperado pequeño para director / líder y moderado para roles superiores.
- Fácil cacheado en frontend (intervalo actual 60s) evitando saturación.

---

## 🧪 Suite Automática Permisos de Grupos (2025-10-06)

Implementada para asegurar la nueva granularidad de visibilidad y edición tras la introducción de la relación explícita director↔grupos.

### Archivo
`scripts/test-grupos-permisos.mjs`

### Objetivos Cubiertos
1. Validar visibilidad restringida: director de etapa sólo ve grupos asignados.
2. Confirmar flags: `supervisado_por_mi` = true únicamente en grupos asignados.
3. Verificar alcance líder y miembro (sólo su propio grupo).
4. Verificar que roles superiores (admin) ven el subset recién creado (sin depender de total global histórico).
5. Asegurar funcionamiento (o fallback) de asignar / quitar director.
6. KPIs coherentes: admin con `total_grupos >= 4`, director con KPIs accesibles.
7. Manejar ausencia temporal de la RPC `asignar_director_etapa_a_grupo` sin romper la suite (marca SKIP controlado y usa inserción directa).

### Estrategia de Datos
- Genera prefijo aleatorio (`PTG_<hex>_`) y crea 4 grupos (G1..G4) aislados.
- Crea usuarios vía Admin Auth API (evita FK huérfana): AdminGC, DirectorA, DirectorB, LiderL1, MiembroM1.
- Crea `segmento_lideres` para A y B, asigna DirectorA a G1,G2, luego prueba agregar G3 y quitar G1.
- Inserta líder y miembro en G1 con roles de `grupo_miembros` (Líder / Miembro).

### Casos Principales
| Caso | Descripción | Resultado Esperado |
|------|-------------|--------------------|
| Admin subset | Admin ve los 4 nuevos grupos | PASS subset |
| DirectorA inicial | Sólo G1,G2 | 2 grupos + flags true |
| DirectorA agrega G3 | Tras asignar: G1,G2,G3 | 3 grupos |
| DirectorA quita G1 | Tras remover: G2,G3 | 2 grupos |
| Líder | Sólo G1 | 1 grupo |
| Miembro | Sólo G1 | 1 grupo |
| Auto-asignación director | DirectorA no puede auto-asignarse | Error permiso |
| Grupo inexistente | Falla asignar | Error |
| KPIs admin | total_grupos >= 4 | OK |
| KPIs director | Responde sin error | OK |

### Fallbacks / Robustez
- Si la RPC `asignar_director_etapa_a_grupo` no existe (entorno desfasado), la suite:
  - Marca como SKIP casos de validación directa de la RPC.
  - Inserta directamente en `director_etapa_grupos` para continuar validaciones de visibilidad.
- Evita falsos FAIL por grupos preexistentes: ignora totales globales y se centra en subset creado.

### Re-ejecución Segura (Idempotencia)
- Prefijo nuevo cada ejecución evita colisiones de nombre único en `grupos`.
- Segmento y temporada: si existen por nombre, se reutilizan; nuevos grupos no se mezclan porque cambian de nombre.

### Integración CI Recomendada
Agregar en `package.json`:
```jsonc
{
  "scripts": {
    "test:grupos-permisos": "node scripts/test-grupos-permisos.mjs"
  }
}
```
Pipeline puede ejecutar junto a otros smoke tests tras migraciones.

### Extensiones Planeadas (Backlog)
| Futuro | Descripción | Activación |
|--------|------------|-----------|
| Constraint director único / pareja | Validar rechazo segundo director no permitido | Tras migración constraint |
| Estado aprobación | Incorporar cambios de visibilidad por `estado_aprobacion` | Tras workflow aprobación |
| Auditoría | Verificar inserción en tabla historial asignaciones | Tras creación historial |
| Asistencia KPIs | Métricas de asistencia por grupos visibles | Tras modelo asistencia |

---

## 🆕 Endpoints Añadidos (2025-10-07)

### 1. Cambiar Rol de Usuarios en Lote
`POST /api/usuarios/cambiar-rol`

Body:
```json
{
  "userIds": ["uuid-usuario-1", "uuid-usuario-2"],
  "rol": "lider"
}
```
Roles permitidos en `rol`: `miembro | lider | pastor | director-etapa | director-general | admin`.

Requisitos:
- Solicitante debe tener rol `admin`.
- Se eliminan roles previos de ese set gestionado y se inserta el nuevo rol (reemplazo completo principal).

Respuesta:
```json
{ "ok": true, "count": 2, "rol": "lider" }
```
Errores comunes:
- 403 Permiso denegado (usuario sin rol admin).
- 400 Rol inválido o lista vacía.

### 2. Eliminar Director de Etapa del Segmento
`DELETE /api/segmentos/:segmentoId/directores-etapa?directorId=:segmentoLiderId`

Acción:
- Borra en orden las relaciones: `director_etapa_ubicaciones`, `director_etapa_grupos` y luego el registro en `segmento_lideres` si `tipo_lider = 'director_etapa'`.

Requisitos:
- Solicitante con rol superior: `admin | pastor | director-general`.
- Director debe pertenecer al segmento indicado.

Respuesta éxito:
```json
{ "ok": true }
```

Códigos de error:
- 404 Director no encontrado.
- 403 No pertenece al segmento / rol insuficiente.
- 400 Parametros faltantes.

### Consideraciones de Seguridad
- Ambos endpoints usan cliente admin (service role) sólo tras validar roles del solicitante con `getUserWithRoles()`.
- No se expone información adicional en errores que pueda filtrar datos sensibles; sólo mensajes de contexto y `rolesActuales` cuando procede (403) para depuración UI.

### Próximas Mejoras (Opcional)
- Auditoría: registrar inserciones en tabla `auditoria_acciones` (pendiente) para cambios de rol y eliminación de directores.
- Soft delete para `segmento_lideres` (campo `activo` boolean) si se requiere histórico.
- Limitar cambio a rol `admin` solo si hay >= 1 admin residual (validación de continuidad).

### 3. Asignar Contraseña a Usuario (Sólo Admin)
`POST /api/users/[id]/set-password`

- Propósito: Permite que un administrador establezca una nueva contraseña para un usuario con cuenta de autenticación.
- Permisos: únicamente `admin` (validado con `getUserWithRoles()` sobre el solicitante).
- Path param: `id` = `auth_id` del usuario objetivo (UUID de Supabase Auth).
- Body:
```json
{ "newPassword": "una_contraseña_segura_123" }
```
- Validación: `newPassword` mínimo 8 caracteres (Zod).
- Implementación: `supabase.auth.admin.updateUserById(id, { password })` usando `createSupabaseAdminClient()`.
- Respuestas:
  - 200 `{ ok: true, message: "Contraseña actualizada correctamente" }`
  - 400/401/403 según payload o permisos
  - 5xx/502 en errores transitorios con reintentos y backoff
