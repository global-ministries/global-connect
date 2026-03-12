---
description: Workflow para que el agente arquitecto genere planes de implementación y planes de auditoría por fase del proyecto.
---

# Architect Phase Planning

Workflow para generar dos documentos clave por cada fase del proyecto:
1. **Plan de Implementación** — para el agente desarrollador
2. **Plan de Auditoría** — para el agente auditor

> [!CAUTION]
> ## REGLAS INVIOLABLES — LEE ESTO PRIMERO
>
> Las siguientes reglas son **absolutas e innegociables**. Si no las cumples, tus planes serán **defectuosos**. No hay excepciones.
>
> 1. **NUNCA planifiques sin leer las skills** — DEBES ejecutar `view_file` en cada `SKILL.md` relevante ANTES de escribir el plan. Si no conoces las reglas y patrones del proyecto, tu plan guiará al desarrollador por el camino equivocado. Sin evidencia de lectura = plan rechazado.
>
> 2. **NUNCA planifiques sin auditar el estado actual** — DEBES revisar el schema de DB, código existente, y documentación ANTES de planificar. Planificar sin contexto = plan rechazado.
>
> 3. **NUNCA entregues planes incompletos** — Cada entregable DEBE tener: descripción, archivos, especificaciones técnicas, criterios de aceptación, y código de referencia. Entregable sin criterios de aceptación = plan rechazado.
>
> 4. **NUNCA saltees el GATE DE CUMPLIMIENTO** — Antes de entregar, DEBES completar la auto-auditoría. Si algún item es ❌, DEBES completarlo. Entrega con items ❌ = plan rechazado.
>
> **Si descubres que te saltaste un paso, NO entregues. Retrocede y complétalo.**

---

## Prerrequisitos

Antes de iniciar, el arquitecto debe tener claro:
- [ ] Alcance general del proyecto (features, módulos, objetivos)
- [ ] Fases definidas (cantidad, nombre, alcance de cada una)
- [ ] Stack tecnológico (definido en `GEMINI.md` → Tech Stack)
- [ ] Skills relevantes del proyecto (definidas en `.agent/skills/`)
- [ ] Estado actual de la base de datos (schema, RPCs, RLS policies)
- [ ] Restricciones o dependencias entre fases

---

## Paso 1: Investigación y Contexto

Antes de generar cualquier documento, el arquitecto DEBE:

1. **Leer las skills relevantes** para la fase actual:
   - Revisar `GEMINI.md` → "Auto-invoke Skills" para identificar qué skills aplican
   - Usar `view_file` en cada `SKILL.md` relevante
   - Documentar qué patrones y reglas de cada skill aplican a esta fase

2. **Auditar el estado actual**:
   - Schema de base de datos: tablas, columnas, RLS, RPCs existentes
   - Código existente: componentes, actions, hooks relacionados
   - Documentación existente en `docs/`

3. **Identificar dependencias**:
   - ¿Qué necesita estar listo de fases anteriores?
   - ¿Qué bloquea a fases futuras?
   - ¿Hay migraciones de datos necesarias?

---

## Paso 2: Generar el Plan de Implementación

Crear el artifact: `{modulo}-fase{N}-plan-desarrollo.md`

> **Naming**: `{modulo}` es el nombre corto del módulo o feature (ej: `grupos`, `asistencia`, `permisos`). Esto garantiza nombres únicos entre conversaciones.

### Estructura obligatoria del documento:

```markdown
# {modulo}-fase{N}-plan-desarrollo — {Nombre de la Fase}

## Resumen Ejecutivo
- Objetivo de la fase en 2-3 oraciones
- Duración estimada
- Dependencias de fases anteriores

## Skills Requeridas
| Skill | Propósito en esta fase | Patrones clave a seguir |
|-------|----------------------|------------------------|
| `skill-name` | Por qué se necesita | Reglas específicas que aplican |

## Arquitectura de la Fase
- Diagrama de componentes (mermaid)
- Flujo de datos
- Decisiones de diseño y justificación

## Entregables

### Entregable 1: {Nombre}

#### Descripción
Qué se debe construir y por qué.

#### Archivos a crear/modificar
| Archivo | Acción | Descripción del cambio |
|---------|--------|----------------------|
| `path/to/file.ts` | CREAR / MODIFICAR / ELIMINAR | Qué cambia y por qué |

#### Especificaciones técnicas
- Tipos TypeScript necesarios (interfaces, types)
- Validaciones con Zod (schemas)
- Queries SQL / RPCs requeridos
- Componentes UI (props, estados, eventos)

#### Criterios de aceptación
- [ ] Criterio 1: descripción precisa y verificable
- [ ] Criterio 2: descripción precisa y verificable

#### Código de referencia
Snippets o pseudocódigo que guíe al desarrollador en la implementación.
Incluir patrones específicos de las skills relevantes.

---

### Entregable 2: {Nombre}
(Repetir la misma estructura)

---

## Navegación y Visibilidad por Roles

> **Nota**: Solo incluir esta sección si la fase crea páginas nuevas accesibles por el usuario.

Para cada página nueva creada en esta fase, definir:

| Página | Ruta | Menú | Ubicación | Roles permitidos | Icono |
|--------|------|------|-----------|-----------------|-------|
| {Nombre} | `/ruta` | Sidebar + Móvil / Solo Sidebar / Solo Móvil | Principal / Submenú de {padre} / Footer | `admin`, `lider`, `coordinador` | `LucideIconName` |

### Criterios de decisión

- **Menú principal**: Módulos top-level que todos (o la mayoría) usan frecuentemente
- **Submenú**: Páginas secundarias dentro de un módulo (ej: "Casas Anfitrionas" dentro de "Grupos de Vida")
- **Footer**: Páginas utilitarias (ayuda, actualizaciones, configuración)
- **Oculta del menú**: Páginas accesibles solo por enlace directo (ej: `/grupos-vida/[id]/editar`)

### Roles del sistema

| Rol | Descripción |
|-----|-------------|
| `admin` | Acceso completo |
| `coordinador` | Gestión de módulos asignados |
| `lider` | Gestión de su grupo/equipo |
| `voluntario` | Acciones limitadas |
| `miembro` | Solo lectura |

---

## Migraciones de Base de Datos
- SQL detallado para cada migración
- Orden de ejecución
- Rollback plan

## Variables de Entorno
| Variable | Descripción | Dónde se configura |
|----------|-------------|-------------------|

## Orden de Ejecución
1. Primero: migraciones de DB
2. Segundo: tipos y schemas
3. Tercero: server actions
4. Cuarto: componentes UI
5. Quinto: integración y pruebas

## Riesgos y Mitigaciones
| Riesgo | Impacto | Mitigación |
|--------|---------|-----------|

## Checklist Final del Desarrollador
- [ ] Todos los archivos creados/modificados según la tabla
- [ ] Migraciones ejecutadas y verificadas
- [ ] Tipos generados con `pnpm gen:types`
- [ ] RLS policies aplicadas y testeadas
- [ ] Build sin errores: `pnpm build`
- [ ] Smoke test manual de los flujos principales
```

### Reglas para el plan de implementación:

1. **Ser específico, no genérico**: En lugar de "crear un componente de formulario", especificar exactamente qué campos, validaciones, estados y comportamientos tiene.
2. **Incluir código de referencia**: No basta decir "usar React Hook Form + Zod". Dar el schema Zod concreto, el tipo TypeScript, y el patrón de integración.
3. **Respetar las skills**: Cada decisión técnica debe estar alineada con la skill correspondiente. Citar la skill y el patrón específico.
4. **Orden de ejecución claro**: El desarrollador debe poder seguir los pasos en orden sin ambigüedad.
5. **Criterios de aceptación verificables**: Cada criterio debe poder responderse con sí/no.

---

## Paso 3: Generar el Plan de Auditoría

Crear el artifact: `{modulo}-fase{N}-plan-auditoria.md`

### Estructura obligatoria del documento:

```markdown
# {modulo}-fase{N}-plan-auditoria — {Nombre de la Fase}

## Alcance de la Auditoría
- Qué se revisa en esta fase
- Qué NO se revisa (fuera de alcance)
- Referencia al plan de implementación: `{modulo}-fase{N}-plan-desarrollo.md`

## Skills de Referencia para la Auditoría
| Skill | Qué verificar con esta skill |
|-------|------------------------------|
| `code-review` | Checklist de calidad de código |
| `security-nextjs` | Validaciones de seguridad |
| `typescript` | Correctitud de tipos |

## Checklist de Auditoría por Entregable

### Entregable 1: {Nombre}

#### Revisión de Código
- [ ] Nombres descriptivos (variables, funciones, componentes)
- [ ] Sin código muerto o comentado
- [ ] Manejo de errores adecuado (try/catch, error boundaries)
- [ ] Sin `any` explícitos en TypeScript
- [ ] Imports organizados y sin circulares

#### Revisión de Seguridad
- [ ] Server Actions validan autenticación con `requireAuth()` o equivalente
- [ ] RLS policies en todas las tablas nuevas
- [ ] No hay exposición de datos sensibles en Client Components
- [ ] Variables de entorno no expuestas con `NEXT_PUBLIC_` si son secretas
- [ ] Validación de inputs con Zod en server-side

#### Revisión de Base de Datos
- [ ] Migraciones son idempotentes y reversibles
- [ ] Índices creados para queries frecuentes
- [ ] Foreign keys con ON DELETE apropiado
- [ ] RLS habilitado en tablas nuevas
- [ ] RPCs validan permisos internamente

#### Revisión de UI/UX
- [ ] Componentes responsive (mobile y desktop)
- [ ] Estados de loading implementados
- [ ] Estados de error con mensajes claros
- [ ] Accesibilidad básica (labels, roles, contraste)
- [ ] Consistencia con el design system existente

#### Revisión de Performance
- [ ] Server Components por defecto (Client solo si necesario)
- [ ] Sin N+1 queries
- [ ] Datos no sobre-fetched (solo lo necesario)
- [ ] Uso correcto de `Suspense` boundaries
- [ ] Imágenes optimizadas con `next/image` si aplica

#### Criterios de Aceptación (Verificación)
Para cada criterio del plan de implementación:
- [ ] Criterio 1: ¿Se cumple? — Evidencia: {descripción}
- [ ] Criterio 2: ¿Se cumple? — Evidencia: {descripción}

---

### Entregable 2: {Nombre}
(Repetir la misma estructura)

---

## Pruebas a Ejecutar

### Pruebas Funcionales
| Flujo | Pasos | Resultado esperado |
|-------|-------|-------------------|
| {Flujo 1} | 1. Hacer X, 2. Hacer Y | Se muestra Z |

### Pruebas de Borde
| Caso | Input | Resultado esperado |
|------|-------|-------------------|
| Campo vacío | "" | Muestra error de validación |
| Sin permisos | Usuario sin rol X | Redirect o error 403 |

### Pruebas de Regresión
- [ ] Funcionalidades existentes no se rompen
- [ ] Rutas protegidas siguen protegidas
- [ ] Datos existentes no se corrompen con migraciones

## Severidad de Hallazgos

| Nivel | Descripción | Acción |
|-------|-------------|--------|
| 🔴 Crítico | Seguridad, pérdida de datos, crash | Bloquea merge. Fix obligatorio. |
| 🟡 Importante | Bug funcional, tipos incorrectos, N+1 | Fix antes de merge. |
| 🔵 Menor | Estilo de código, naming, docs faltantes | Fix recomendado, no bloquea. |
| ⚪ Sugerencia | Mejoras opcionales, refactors futuros | Se registra para backlog. |

## Formato del Reporte de Auditoría

Al finalizar la auditoría, el auditor debe generar un artifact:
`{modulo}-fase{N}-reporte-auditoria.md`

Con la siguiente estructura:
- Resumen ejecutivo (aprobado / aprobado con observaciones / rechazado)
- Hallazgos por entregable (usando la tabla de severidad)
- Items bloqueantes (si los hay)
- Recomendaciones para siguientes fases
```

### Reglas para el plan de auditoría:

1. **Alineado con el plan de implementación**: Cada entregable del plan de implementación tiene su sección de auditoría correspondiente.
2. **Checklists accionables**: Cada item debe poder marcarse como ✅ o ❌ sin ambigüedad.
3. **Pruebas concretas**: No decir "probar el formulario". Especificar exactamente qué flujo, con qué datos, y qué resultado se espera.
4. **Severidad clara**: El auditor debe saber cuándo bloquear un merge y cuándo solo registrar una observación.

---

## Paso 4: Revisión y Entrega

1. El arquitecto genera ambos artifacts usando `write_to_file` con `IsArtifact: true`
2. Solicita revisión al usuario antes de que el desarrollador comience
3. Una vez aprobados, el desarrollador usa el plan de implementación
4. Al terminar, el auditor usa el plan de auditoría
5. El auditor genera el reporte de auditoría como artifact
6. Si hay hallazgos bloqueantes, se corrigen antes de avanzar a la siguiente fase

---

## Artifacts Generados por Fase

Todos los documentos se crean como **artifacts** en el directorio brain de la conversación (`<appDataDir>/brain/<conversation-id>/`).

### Naming Convention

Los nombres de artifacts DEBEN incluir el **módulo** como prefijo para ser únicos entre conversaciones:

| Documento | Patrón | Ejemplo |
|-----------|--------|---------|
| Plan de desarrollo | `{modulo}-fase{N}-plan-desarrollo.md` | `grupos-fase1-plan-desarrollo.md` |
| Plan de auditoría | `{modulo}-fase{N}-plan-auditoria.md` | `grupos-fase1-plan-auditoria.md` |
| Reporte de auditoría | `{modulo}-fase{N}-reporte-auditoria.md` | `grupos-fase1-reporte-auditoria.md` |

Donde `{modulo}` es el nombre corto del módulo (ej: `grupos`, `servicio`, `ruta-crecimiento`).

### Cómo crear los artifacts

Usar `write_to_file` con:
- `TargetFile`: `<appDataDir>/brain/<conversation-id>/{modulo}-fase{N}-plan-desarrollo.md`
- `IsArtifact`: `true`
- `ArtifactMetadata.ArtifactType`: `implementation_plan`
- `ArtifactMetadata.Summary`: Resumen detallado del contenido

Para el plan de auditoría:
- `TargetFile`: `<appDataDir>/brain/<conversation-id>/{modulo}-fase{N}-plan-auditoria.md`
- `ArtifactMetadata.ArtifactType`: `other`
- `ArtifactMetadata.Summary`: Resumen del alcance de auditoría

---

## Comandos Útiles

```bash
# Explorar schema actual de la DB
pnpm gen:types

# Verificar build antes de entregar
pnpm build

# Ver migraciones existentes
ls supabase/migrations/
```

---

## Ejemplo de Invocación

Cuando el usuario diga algo como:
- "Genera el plan de la fase 1"
- "Planifica la fase 2 del módulo X"
- "/architect fase 1"

El agente arquitecto debe:
1. Seguir este workflow paso a paso
2. Leer las skills relevantes (`view_file` en cada `SKILL.md`)
3. Auditar el estado actual del código y la DB
4. Generar el artifact `{modulo}-fase{N}-plan-desarrollo.md` con la estructura completa
5. Generar el artifact `{modulo}-fase{N}-plan-auditoria.md` alineado al plan de implementación
6. Solicitar revisión al usuario con `notify_user` (incluyendo `PathsToReview` con las rutas de los artifacts)

---

## ⛔ GATE DE CUMPLIMIENTO — Paso Final Obligatorio

> [!CAUTION]
> **NO PUEDES ENTREGAR sin completar esta tabla.** Si algún item es ❌, DEBES retroceder y completarlo ANTES de entregar. Entrega con items ❌ = RECHAZADA.

Antes de llamar a `notify_user` para entregar, el agente arquitecto DEBE verificar:

```markdown
## Auto-Auditoría de Cumplimiento del Arquitecto

| Paso | Requisito | Estado | Evidencia |
|------|-----------|--------|-----------|
| 1a | Leí TODAS las skills relevantes con `view_file` | ✅/❌ | Lista de skills leídas |
| 1b | Audité el estado actual de DB y código | ✅/❌ | Tablas y archivos revisados |
| 2a | Plan de implementación tiene TODOS los entregables con criterios de aceptación | ✅/❌ | Cantidad de entregables |
| 2b | Cada entregable tiene: descripción, archivos, specs técnicas, código de referencia | ✅/❌ | Entregables verificados |
| 2c | Sección de navegación + roles completada (si aplica) | ✅/❌/N/A | Páginas definidas |
| 3 | Plan de auditoría generado y alineado al plan de implementación | ✅/❌ | Ruta del artifact |
| 4 | Ambos artifacts generados con nombres correctos | ✅/❌ | Rutas de artifacts |
```

---

## Ciclo de Vida — Posición en el Flujo

```
🔵 TÚ (ARQUITECTO) planificas  →  DESARROLLADOR  →  AUDITOR  →  🔵 TÚ apruebas  →  DOCUMENTACIÓN
```

### Fase 1: Planificación (inicio del ciclo)

| Input | Output |
|-------|--------|
| Requisitos del usuario, recomendaciones de fases anteriores | `{modulo}-fase{N}-plan-desarrollo.md`, `{modulo}-fase{N}-plan-auditoria.md` |

### Fase 2: Aprobación final (después del auditor)

Cuando el auditor entrega su veredicto ✅, tú revisas:
- `{modulo}-fase{N}-reporte-auditoria.md` — ¿la calidad cumple tus expectativas?
- `{modulo}-fase{N}-reporte-desarrollo.md` — ¿se implementó el plan correctamente?

| Decisión | Siguiente paso |
|----------|---------------|
| ✅ Aprobado | Ejecutar `/documentation-management` → siguiente fase |
| ❌ Necesita más trabajo | Devolver al desarrollador con instrucciones específicas |

### Workflow que ejecutas
- **Principal**: `/architect-phase-planning`
- **Skills**: Todas las relevantes al módulo (ver tabla Auto-invoke en `GEMINI.md`)
