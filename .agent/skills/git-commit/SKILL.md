---
name: git-commit
description: Crear commits git atómicos con mensajes convencionales en español. Sin emojis. Analiza el diff y genera el mensaje correcto. Invocar cuando el usuario pide hacer un commit, menciona "/commit", o cuando se termina una tarea de desarrollo.
license: MIT
allowed-tools: Bash
metadata:
  scope: global
  auto_invoke:
    - Crear un commit de git
    - Hacer commit de cambios
    - Finalizar una tarea de desarrollo
    - Generar mensaje de commit desde un diff
---

# Commits de Git — Estándar GlobalConnect

## Principio

Un commit = un cambio lógico. El historial de git debe leerse como documentación técnica: claro, preciso y sin adornos.

> **Sin emojis.** La especificación oficial de Conventional Commits no los usa. En entornos profesionales, los emojis interfieren con herramientas de automatización (`git log --grep`, changelogs, CI), causan problemas de compatibilidad en terminales y dificultan búsquedas. GlobalConnect sigue el estándar puro.

---

## Formato

```
<tipo>[alcance]: <descripción>

[cuerpo opcional]

[pie opcional]
```

### Tipos permitidos

| Tipo | Cuándo usarlo |
|------|--------------|
| `feat` | Nueva funcionalidad para el usuario |
| `fix` | Corrección de un bug |
| `docs` | Solo documentación |
| `style` | Formato, puntuación (sin cambio de lógica) |
| `refactor` | Restructuración de código (sin feat ni fix) |
| `perf` | Mejora de rendimiento |
| `test` | Agregar o corregir tests |
| `build` | Sistema de build, dependencias (pnpm, webpack) |
| `ci` | Pipelines CI/CD, configuración de Vercel |
| `chore` | Mantenimiento, limpieza |
| `revert` | Revertir un commit anterior |

### Alcances del proyecto (scope)

Usar el nombre del módulo o área afectada:

```
auth, dashboard, grupos, miembros, correo, db, api,
ui, config, middleware, permisos, informes
```

### Breaking changes

```
feat!: eliminar endpoint /api/v1/grupos

BREAKING CHANGE: migrar a /api/v2/grupos — ver docs/migracion.md
```

---

## Flujo de trabajo

### 1. Revisar cambios

```bash
# Estado del repositorio
git status --porcelain

# Diff de staged (si hay archivos stageed)
git diff --staged

# Diff completo si nada está staged
git diff
```

### 2. Stagear por lógica, no por archivo

```bash
# Stagear archivos específicos
git add ruta/al/archivo1 ruta/al/archivo2

# Stagear por patrón
git add src/components/ app/api/

# Stagear interactivamente (cambios parciales en un archivo)
git add -p
```

**Nunca stagear:** archivos `.env`, credenciales, claves privadas.

### 3. Generar el mensaje

Analizar el diff para determinar:

- **Tipo**: ¿Qué clase de cambio es?
- **Alcance**: ¿Qué módulo o área se ve afectada?
- **Descripción**: Resumen en una línea — modo imperativo, ≤72 caracteres, en **español**

### 4. Ejecutar el commit

```bash
# Commit de una línea
git commit -m "tipo(alcance): descripción"

# Commit con cuerpo y pie
git commit -m "$(cat <<'EOF'
tipo(alcance): descripción

Cuerpo explicando el porqué del cambio, no el qué.
El qué lo dice el código; el porqué lo dice el commit.

Closes #123
EOF
)"
```

---

## Reglas de redacción

| Regla | Correcto | Incorrecto |
|-------|----------|------------|
| Modo imperativo | `agrega validación` | `agregada validación` / `agrega validación 🎉` |
| Sin mayúscula inicial en descripción | `feat: agrega filtro por región` | `feat: Agrega filtro por región` |
| Sin punto final | `fix: corrige cálculo de KPIs` | `fix: corrige cálculo de KPIs.` |
| En español | `feat(grupos): agrega vista de miembros` | `feat(grupos): add member view` |
| ≤72 caracteres | `fix(auth): corrige expiración de sesión en SSR` | *(línea de 90 chars)* |
| Sin emojis | `feat: implementa envío de invitaciones` | `feat: ✨ implementa envío de invitaciones` |

---

## Ejemplos reales del proyecto

```
feat(grupos): agrega paginación server-side con debounce
fix(auth): corrige refresh de token en middleware de Supabase
refactor(dashboard): extrae lógica de KPIs a hook reutilizable
perf(db): agrega índice en grupos.created_at para queries de reporte
docs(correo): documenta configuración de Resend y variables de entorno
chore: actualiza dependencias de pnpm a últimas versiones estables
ci: agrega preview deployment automático en pull requests
test(grupos): agrega tests de integración para RPC obtener_miembros
```

---

## Protocolo de seguridad

- **NUNCA** modificar la configuración global de git
- **NUNCA** ejecutar comandos destructivos (`--force`, `reset --hard`) sin solicitud explícita
- **NUNCA** omitir hooks con `--no-verify` salvo indicación del usuario
- **NUNCA** hacer force-push a `main` o `production`
- Si el commit falla por hooks, corregir el problema y hacer un **nuevo commit** (no `--amend`)
