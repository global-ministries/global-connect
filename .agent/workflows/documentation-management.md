---
description: Workflow para mantener actualizada toda la documentación del proyecto — usuario final, técnica para desarrolladores/agentes, changelog profesional, y página interna de cambios.
---

# Documentation Management

Workflow que gobierna **toda la documentación** del proyecto tras cada fase, feature o fix:

1. **Documentación de usuario final** — Guías de uso para miembros de la organización
2. **Documentación técnica** — Para desarrolladores y agentes AI
3. **Changelog profesional** — `CHANGELOG.md` con formato Keep a Changelog
4. **Página interna de actualizaciones** — Página dentro de la app para ver cambios

---

## Cuándo Ejecutar Este Workflow

Ejecutar **después de cualquier cambio que afecte** al menos una de estas áreas:

| Tipo de cambio | Docs usuario | Docs técnica | Changelog | Página interna |
|----------------|:---:|:---:|:---:|:---:|
| Feature nueva visible al usuario | ✅ | ✅ | ✅ | ✅ |
| Feature nueva solo backend/DB | ❌ | ✅ | ✅ | ✅ |
| Fix de bug visible al usuario | ✅ (si cambia flujo) | ✅ | ✅ | ✅ |
| Fix de bug interno | ❌ | ✅ | ✅ | ✅ |
| Cambio de seguridad | ❌ | ✅ | ✅ | ✅ |
| Refactor sin cambio funcional | ❌ | ✅ (si cambia API/patrón) | ✅ | ❌ |
| Migración de datos | ✅ (si afecta UX) | ✅ | ✅ | ✅ |

---

## Skill Requerida

Siempre invocar `technical-writer` (`view_file` en `.agent/skills/technical-writer/SKILL.md`) antes de escribir cualquier documentación.

---

## Paso 0: Auditoría de Documentación Existente (OBLIGATORIO)

**Antes de crear o editar cualquier documentación**, el agente DEBE:

### 1. Inventariar toda la documentación existente

```bash
# Listar toda la estructura de docs/
find docs/ -type f -name "*.md" | sort

# Listar docs de usuario si existen
find docs/usuario/ -type f -name "*.md" 2>/dev/null | sort

# Listar docs de API
find docs/api/ -type f -name "*.md" | sort
```

Usar `list_dir` y `find_by_name` para explorar:
- `docs/` — Documentación de sistema y módulos
- `docs/api/` — Documentación de APIs y RPCs
- `docs/usuario/` — Guías de usuario final (si existe)
- `CHANGELOG.md` — Changelog actual
- `lib/data/actualizaciones.ts` — Datos de la página interna (si existe)

### 2. Leer los archivos relevantes

Para cada archivo de documentación que pueda estar relacionado con los cambios:
- Usar `view_file` para leer su contenido
- Anotar qué secciones ya existen
- Identificar qué está desactualizado vs qué falta

### 3. Decidir: crear o actualizar

| Situación | Acción |
|-----------|--------|
| Ya existe doc del módulo y está desactualizada | **Actualizar** secciones afectadas |
| Ya existe doc del módulo y está al día | **No tocar** |
| No existe doc del módulo | **Crear** archivo nuevo |
| Existe doc parcial (le faltan secciones) | **Agregar** secciones faltantes |

### 4. Registrar el plan de documentación

Antes de escribir, listar explícitamente:
- Qué archivos se van a **crear** (con ruta completa)
- Qué archivos se van a **actualizar** (con secciones específicas)
- Qué archivos **no se tocan** (y por qué)

> ⚠️ **NUNCA crear un archivo de documentación sin antes verificar que no existe uno equivalente.** Documentación duplicada es peor que documentación faltante.

---

## Paso 1: Documentación de Usuario Final

**Ubicación**: `docs/usuario/`
**Audiencia**: Líderes, pastores, directores, administradores de la organización
**Idioma**: Español, sin jerga técnica

### Cuándo crear/actualizar

- Feature nueva que el usuario puede ver o interactuar
- Cambio en flujos existentes (botones movidos, pasos nuevos, permisos cambiados)
- Datos que se muestran de forma diferente

### Estructura de cada guía

```markdown
# {Nombre del Módulo o Feature}

> Última actualización: {fecha}

## ¿Qué es?
{Explicación breve en 1-2 oraciones. Sin tecnicismos.}

## ¿Quién puede usarlo?
| Rol | Acceso |
|-----|--------|
| Admin | Completo |
| Pastor | Lectura y edición |
| Líder | Solo lectura |

## Cómo usarlo

### {Tarea principal 1}
1. Ir a **{ruta en la app}**
2. Hacer clic en **{botón/enlace}**
3. Completar el formulario con:
   - **{Campo}**: {qué poner}
   - **{Campo}**: {qué poner}
4. Hacer clic en **Guardar**

> 💡 {Tip útil sobre esta tarea}

### {Tarea principal 2}
{Repetir patrón}

## Preguntas Frecuentes

**¿Qué pasa si {situación}?**
{Respuesta directa}

**¿Puedo {acción}?**
{Respuesta directa}
```

### Reglas de escritura para usuario final

1. **Lenguaje simple**: "Hacer clic en Guardar", no "Ejecutar la acción de persistencia"
2. **Rutas visuales**: Usar negrita para botones y menús — **Dashboard > Grupos > Crear**
3. **Sin código**: Nunca mostrar código, SQL, o nombres de archivos
4. **Capturas de pantalla**: Si el cambio es visual, incluir screenshots con anotaciones
5. **Roles**: Siempre indicar qué roles pueden hacer cada acción

### Archivos existentes en `docs/usuario/` (mantener actualizados)

El agente debe verificar si ya existe documentación de usuario para el módulo afectado. Si existe, actualizarla. Si no, crearla.

---

## Paso 2: Documentación Técnica

**Ubicación**: `docs/` (raíz para docs de sistema) y `docs/api/` (para APIs y RPCs)
**Audiencia**: Desarrolladores humanos y agentes AI
**Idioma**: Español en prosa, inglés en código

### Tipos de documentación técnica

#### A) Documentación de API / RPCs (`docs/api/`)

Para cada RPC o endpoint nuevo/modificado:

```markdown
# {nombre_del_rpc}

## Propósito
{Qué hace y cuándo usarlo}

## Firma
```sql
CREATE FUNCTION {nombre}({parámetros}) RETURNS {tipo}
```

## Parámetros
| Nombre | Tipo | Requerido | Descripción |
|--------|------|-----------|-------------|
| `p_param` | `uuid` | ✅ | {Descripción} |

## Retorno
{Descripción del tipo de retorno con ejemplo}

## Permisos
- Requiere autenticación: ✅/❌
- RLS: {descripción de las policies que aplican}
- Roles mínimos: {lista de roles}

## Ejemplo de uso
```typescript
const { data, error } = await supabase.rpc('nombre', { p_param: value })
```

## Notas
{Consideraciones, limitaciones, dependencias}
```

#### B) Documentación de módulo/sistema (`docs/`)

Para cada módulo o subsistema nuevo/modificado:

```markdown
# {Nombre del Módulo}

> Última actualización: {fecha}

## Descripción
{Qué hace este módulo y cómo encaja en el sistema}

## Arquitectura

```mermaid
{diagrama de componentes}
```

## Tablas de Base de Datos
| Tabla | Propósito | RLS |
|-------|-----------|-----|
| `{tabla}` | {propósito} | ✅/❌ |

## Server Actions
| Action | Archivo | Permisos | Descripción |
|--------|---------|----------|-------------|
| `{action}` | `lib/actions/{file}.ts` | {roles} | {desc} |

## Componentes
| Componente | Tipo | Archivo | Descripción |
|-----------|------|---------|-------------|
| `{Comp}` | Server/Client | `components/{file}` | {desc} |

## Hooks
| Hook | Archivo | Descripción |
|------|---------|-------------|
| `{hook}` | `hooks/{file}` | {desc} |

## Flujo de Datos
1. {Paso 1: Usuario → Componente}
2. {Paso 2: Componente → Server Action}
3. {Paso 3: Server Action → RPC/Supabase}
4. {Paso 4: Retorno y actualización de UI}

## Decisiones de Diseño
| Decisión | Razón | Alternativa descartada |
|----------|-------|----------------------|
| {decisión} | {por qué} | {qué se consideró} |
```

### Reglas para documentación técnica

1. **Siempre actualizar**: Si un RPC, tabla o componente cambió, actualizar su doc
2. **Inventario completo**: Listar TODOS los archivos involucrados, no solo los nuevos
3. **Permisos explícitos**: Siempre documentar qué roles pueden ejecutar qué
4. **Diagramas mermaid**: Para flujos complejos, siempre incluir diagrama
5. **Ejemplos de código reales**: Usar código real del proyecto, no pseudocódigo

---

## Paso 3: Actualizar CHANGELOG.md

**Archivo**: `CHANGELOG.md` (raíz del proyecto)
**Formato**: [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) + [Conventional Commits](https://www.conventionalcommits.org/)

### Reglas del Changelog

1. **Versión semántica**:
   - MAJOR (X.0.0): Cambio breaking o hito importante del proyecto
   - MINOR (0.X.0): Feature nueva o conjunto de cambios significativos
   - PATCH (0.0.X): Fix de bug, corrección menor

2. **Categorías** (en este orden):

   | Categoría | Cuándo usarla | Ejemplo |
   |-----------|---------------|---------|
   | **Agregado** | Feature nueva | Nuevo componente, RPC, tabla |
   | **Cambiado** | Modificación de existente | Refactor de action, cambio de parámetros |
   | **Deprecado** | Se eliminará pronto | Helper que será reemplazado |
   | **Eliminado** | Se removió | Archivo, ruta, dependencia eliminada |
   | **Corregido** | Bug fix | Fix de error, corrección de tipo |
   | **Seguridad** | Vulnerabilidad corregida | RLS, auth, headers |
   | **Migración de Datos** | Cambio en datos existentes | Asignación masiva, limpieza |

3. **Formato de cada entrada**:
   - Empezar con el archivo o componente afectado entre backticks
   - Usar verbos en pasado
   - Máximo 1 línea por item
   - Agrupar items relacionados

4. **Template de nueva versión**:
   ```markdown
   ## [{versión}] - {YYYY-MM-DD}

   ### Agregado
   - {Descripción concisa del nuevo feature/componente/archivo}

   ### Cambiado
   - `{archivo}`: {qué cambió y por qué}

   ### Seguridad
   - {Descripción del cambio de seguridad}

   ### Corregido
   - {Descripción del bug corregido}
   ```

5. **Qué NO poner en el changelog**:
   - Cambios internos que no afectan funcionalidad (formateo, linting)
   - Detalles de implementación excesivos
   - Nombres de variables o funciones internas sin contexto

---

## Paso 4: Página Interna de Actualizaciones

**Ubicación**: `app/dashboard/actualizaciones/page.tsx`
**Propósito**: Que los usuarios internos vean qué cambió en la plataforma sin leer el CHANGELOG técnico

### Estructura de la página

La página debe mostrar una lista de actualizaciones en orden cronológico inverso, con un diseño limpio y consistente con el design system.

### Datos de actualizaciones

Crear un archivo de datos: `lib/data/actualizaciones.ts`

```typescript
export interface Actualizacion {
  version: string
  fecha: string // YYYY-MM-DD
  titulo: string
  descripcion: string
  tipo: 'feature' | 'mejora' | 'correccion' | 'seguridad'
  modulo: string // 'grupos' | 'usuarios' | 'dashboard' | 'sistema'
  detalles: string[] // Lista de cambios visibles al usuario
  impactoRoles?: string[] // Qué roles se ven afectados
}
```

### Reglas para la página interna

1. **Solo cambios visibles**: No incluir refactors internos ni fixes de DB
2. **Lenguaje de usuario**: "Ahora puedes filtrar grupos por campus" no "Query param campus_id en API"  
3. **Agrupado por versión**: Cada versión es una tarjeta o sección
4. **Badges de tipo**: Feature (verde), Mejora (azul), Corrección (amarillo), Seguridad (rojo)
5. **Filtros opcionales**: Por módulo, por tipo, por fecha

### Cuándo actualizar

- Cada vez que se actualiza el CHANGELOG con cambios visibles al usuario
- El agente debe agregar una nueva entrada en `lib/data/actualizaciones.ts`
- La página lee este archivo y renderiza automáticamente

---

## Paso 5: Crear Commit de Documentación

**Skills requeridas**: Invocar `conventional-commit` y `git-commit` antes de ejecutar.

### Proceso

1. **Revisar el diff** de todos los archivos de documentación modificados/creados:
   ```bash
   git diff --stat
   git diff --name-only
   ```

2. **Agregar solo archivos de documentación** al staging:
   ```bash
   git add docs/ CHANGELOG.md lib/data/actualizaciones.ts app/dashboard/actualizaciones/
   ```
   > ⚠️ Solo incluir archivos de documentación. Si hay cambios de código mezclados, separarlos en commits distintos.

3. **Generar el mensaje de commit** siguiendo Conventional Commits:

   | Tipo de cambio | Mensaje de commit |
   |----------------|-------------------|
   | Docs nuevas + changelog | `docs(modulo): agregar documentación de {feature}` |
   | Actualización de docs existentes | `docs(modulo): actualizar documentación de {feature}` |
   | Solo changelog | `docs(changelog): registrar cambios de v{X.Y.Z}` |
   | Docs + página interna | `docs(modulo): documentar {feature} y actualizar página de cambios` |

4. **Ejecutar el commit**:
   ```bash
   git commit -m "docs(scope): mensaje descriptivo"
   ```

### Reglas del commit de documentación

1. **Commit atómico**: Un solo commit para toda la documentación de una fase/feature
2. **Docs + código juntos o separados** — depende del contexto:
   - **Juntos**: Si los docs son parte integral del cambio (ej: nuevo feature + su guía de uso) → incluir todo en un solo commit con `feat(scope)` o `fix(scope)`
   - **Separados**: Si la documentación se genera post-fase (como en este workflow tras una auditoría completa) → commit dedicado con `docs(scope)`
3. **Scope claro**: Usar el nombre del módulo como scope (`grupos`, `usuarios`, `dashboard`)
4. **Sin emojis**: Seguir el estándar de Conventional Commits del proyecto
5. **Idioma español**: El mensaje del commit debe estar en español

---

## Checklist de Ejecución

Al finalizar cualquier fase o feature, el agente debe:

- [ ] **Auditoría** (Paso 0): Inventariar docs existentes antes de escribir
- [ ] **Docs usuario**: ¿El cambio afecta la experiencia del usuario? → Crear/actualizar guía en `docs/usuario/`
- [ ] **Docs técnica**: ¿Cambió algún RPC, tabla, action, componente? → Actualizar en `docs/` o `docs/api/`
- [ ] **CHANGELOG**: Agregar entrada con versión, fecha y categorías correctas
- [ ] **Página interna**: ¿El cambio es visible al usuario? → Agregar entrada en `lib/data/actualizaciones.ts`
- [ ] **Consistencia**: Verificar que los 4 documentos son coherentes entre sí
- [ ] **Skill invocada**: ¿Se leyó `technical-writer` antes de escribir?
- [ ] **Commit**: Crear commit atómico con `docs(scope): mensaje` siguiendo `conventional-commit` + `git-commit`

---

## Ejemplo de Invocación

Cuando el usuario diga algo como:
- "Documenta los cambios de esta fase"
- "Actualiza el changelog"
- "Genera la documentación"
- "/documentation-management"

El agente debe:
1. Identificar qué cambió (revisar diff, plan de implementación, o reporte de auditoría)
2. Invocar las skills `technical-writer`, `conventional-commit`, `git-commit`
3. Ejecutar Paso 0 (auditoría de docs existentes)
4. Recorrer los pasos 1–4 según aplique
5. Marcar cada item del checklist
6. Crear commit de documentación (Paso 5)
7. Solicitar revisión al usuario

---

## Ciclo de Vida — Posición en el Flujo

```
ARQUITECTO → DESARROLLADOR → AUDITOR → ARQUITECTO aprueba → 🔵 TÚ (DOCUMENTACIÓN) actualizas → SIGUIENTE FASE
```

### Input (lo que recibes)
| Fuente | Qué contiene |
|--------|--------------|
| `{modulo}-fase{N}-plan-desarrollo.md` | Qué se construyó (entregables, specs) |
| `{modulo}-fase{N}-reporte-desarrollo.md` | Qué implementó el desarrollador |
| `{modulo}-fase{N}-reporte-auditoria.md` | Veredicto del auditor, hallazgos |
| Commits `feat(scope)` + `fix(scope)` | Código final en el repositorio |

### Output (lo que produces)
| Entregable | Ubicación | Para quién |
|-----------|-----------|------------|
| Guías de usuario | `docs/usuario/` | Usuarios finales |
| Docs técnicas | `docs/` + `docs/api/` | Desarrolladores y agentes |
| Changelog | `CHANGELOG.md` | Registro formal |
| Página interna | `lib/data/actualizaciones.ts` | Usuarios de la app |
| Commit `docs(scope)` | Repositorio | Historial |

### Siguiente paso
- Documentación completada → la fase está **cerrada**
- El **Arquitecto** puede planificar la siguiente fase con `/architect-phase-planning`

### Workflow que ejecutas
- **Principal**: `/documentation-management`
- **Skills**: `technical-writer`, `conventional-commit`, `git-commit`
