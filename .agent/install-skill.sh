#!/bin/bash
# install-skill.sh — Wrapper para instalar skills SOLO en .agent/skills/
# Uso: ./.agent/install-skill.sh <source>[@skill] [--yes]
# Ejemplo: ./.agent/install-skill.sh resend/email-best-practices@email-best-practices --yes

set -e

AGENT_SKILLS_DIR="$(cd "$(dirname "$0")/skills" && pwd)"

echo "▶ Instalando skill: $@"
echo ""

# Instalar con el CLI (va a .agents/ por defecto)
npx -y skills add "$@"

echo ""
echo "▶ Moviendo a .agent/skills/ ..."

# Copiar lo que el CLI instaló en .agents/skills/ a .agent/skills/
if [ -d ".agents/skills" ]; then
  for skill_dir in .agents/skills/*/; do
    skill_name=$(basename "$skill_dir")
    if [ ! -d "$AGENT_SKILLS_DIR/$skill_name" ]; then
      cp -rL "$skill_dir" "$AGENT_SKILLS_DIR/$skill_name"
      echo "  ✓ $skill_name"
    else
      echo "  ⚡ $skill_name ya existe, omitiendo"
    fi
  done
fi

echo ""
echo "▶ Limpiando carpetas innecesarias ..."

# Eliminar carpetas de otros agentes
[ -d ".agents" ] && rm -rf .agents && echo "  ✓ .agents/ eliminada"
[ -d ".claude" ] && rm -rf .claude && echo "  ✓ .claude/ eliminada"
[ -d ".kiro" ] && rm -rf .kiro && echo "  ✓ .kiro/ eliminada"
[ -d ".codex" ] && rm -rf .codex && echo "  ✓ .codex/ eliminada"
[ -d ".copilot" ] && rm -rf .copilot && echo "  ✓ .copilot/ eliminada"

echo ""
echo "✅ Listo. Skills disponibles en .agent/skills/:"
ls "$AGENT_SKILLS_DIR/" | column
