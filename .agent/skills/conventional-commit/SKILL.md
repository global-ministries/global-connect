---
name: conventional-commit
description: Generar mensajes de commit bajo la especificación Conventional Commits, en español, sin emojis, con los tipos y alcances definidos para GlobalConnect. Invocar cuando se necesite construir o validar un mensaje de commit.
metadata:
  scope: global
  auto_invoke:
    - Generar mensaje de commit
    - Validar formato de commit
    - Construir commit message desde diff
    - Revisar si un commit message cumple el estándar
---

# Conventional Commits — Estándar GlobalConnect

## Especificación

[conventionalcommits.org v1.0.0](https://www.conventionalcommits.org/es/v1.0.0/) — seguida al pie de la letra, **sin emojis**.

Los emojis no forman parte de la especificación oficial. En proyectos profesionales generan problemas de compatibilidad con herramientas de CI/CD, dificultad para hacer `git log --grep`, y no son accesibles para todos los entornos. GlobalConnect usa texto puro.

---

## Estructura

```
<tipo>[alcance opcional]: <descripción>

[cuerpo opcional]

[pie(s) opcional(es)]
```

### Reglas obligatorias

1. El **tipo** debe ser uno de los definidos abajo
2. El **alcance** es opcional pero recomendado — entre paréntesis
3. La **descripción** va en español, modo imperativo, sin mayúscula inicial ni punto final
4. El **cuerpo** explica el *porqué* del cambio, no el *qué*
5. El **pie** se usa para breaking changes o referencias a issues

---

## Tipos

| Tipo | Uso | SemVer |
|------|-----|--------|
| `feat` | Nueva funcionalidad para el usuario | MINOR |
| `fix` | Corrección de bug | PATCH |
| `docs` | Solo documentación | — |
| `style` | Formato, espaciado, puntuación (sin lógica) | — |
| `refactor` | Restructuración sin feat ni fix | — |
| `perf` | Mejora de rendimiento medible | PATCH |
| `test` | Agregar o corregir tests | — |
| `build` | Build system o dependencias externas | — |
| `ci` | Pipelines CI/CD, configuración de deploy | — |
| `chore` | Mantenimiento, limpieza de código | — |
| `revert` | Revertir commit anterior | — |

---

## Alcances del proyecto (GlobalConnect)

```
auth        → autenticación, sesiones, middleware
dashboard   → vistas de dashboard (director, supervisor, etc.)
grupos      → gestión de grupos y subgrupos
miembros    → perfiles de miembros
correo      → emails, plantillas, Resend
db          → base de datos, migraciones, RPCs
api         → route handlers (app/api/)
ui          → componentes de interfaz
config      → configuración del proyecto
middleware  → middleware de Next.js
permisos    → roles, políticas RLS
informes    → reportes, exportación, KPIs
```

---

## Workflow de generación

```bash
# 1. Ver qué cambió
git status
git diff --staged   # si hay staged
git diff            # si no hay staged

# 2. Identificar tipo y alcance desde el diff

# 3. Construir el mensaje
git commit -m "tipo(alcance): descripción"

# 4. Con cuerpo y pie (cambio complejo)
git commit -m "$(cat <<'EOF'
tipo(alcance): descripción breve del cambio

Explicación del porqué fue necesario este cambio.
Puede ocupar varias líneas. Cada una ≤72 caracteres.

Closes #45
EOF
)"
```

---

## Breaking Changes

Dos formas válidas — se pueden combinar:

```bash
# Signo de exclamación en el tipo
feat!: eliminar soporte para autenticación por magic link

# Pie BREAKING CHANGE (se puede añadir también con !)
feat(auth)!: migrar a Supabase Auth SSR

BREAKING CHANGE: las sesiones ahora se gestionan via cookies httpOnly.
Actualizar todos los clientes que usaban localStorage.

Closes #102
```

---

## Ejemplos correctos — GlobalConnect

```
feat(grupos): implementa creación de subgrupos con validación de jerarquía
fix(auth): corrige expiración de sesión al navegar entre rutas protegidas
refactor(dashboard): extrae cálculo de KPIs a funciones puras reutilizables
perf(db): agrega índice compuesto en miembros(grupo_id, created_at)
docs(correo): agrega guía de configuración de Resend en producción
chore: limpia imports no utilizados en componentes de dashboard
ci: configura preview deployment automático en Vercel para PRs
test(grupos): agrega suite de integración para RPC obtener_miembros_activos
build: actualiza Next.js a 15.2.1 y resuelve breaking change en metadata
style(ui): aplica formato consistente a constantes de color del sistema
```

## Ejemplos incorrectos — NO usar

```
# ❌ Emojis
feat: ✨ nueva funcionalidad increíble

# ❌ Inglés
fix(auth): fix session expiration bug

# ❌ Pasado
feat(grupos): se agregó la vista de miembros

# ❌ Punto final
fix: corrige cálculo de totales.

# ❌ Mayúscula en descripción
feat: Agrega validación de formulario

# ❌ Mensaje vago
fix: corrección de bug
chore: cambios varios
```

---

## Validación rápida

Antes de hacer el commit, verificar:

- [ ] ¿El tipo es uno de los permitidos?
- [ ] ¿El alcance identifica bien el módulo afectado?
- [ ] ¿La descripción está en español, modo imperativo?
- [ ] ¿Tiene menos de 72 caracteres la primera línea?
- [ ] ¿Sin mayúscula inicial? ¿Sin punto al final?
- [ ] ¿Sin emojis?
- [ ] ¿Un solo cambio lógico por commit?
- [ ] Si es breaking change, ¿está marcado con `!` y/o pie `BREAKING CHANGE`?
