#!/bin/bash
# =============================================================================
# Backup de la base de datos GlobalConnect antes de migraciones.
# Uso: DATABASE_URL="postgresql://..." ./scripts/db-backup.sh
# =============================================================================
set -euo pipefail

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="backups"
BACKUP_FILE="${BACKUP_DIR}/gc_${TIMESTAMP}.sql"

# Verificar que DATABASE_URL esté definida
if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Error: DATABASE_URL no está definida."
  echo "   Uso: DATABASE_URL=\"postgresql://...\" ./scripts/db-backup.sh"
  exit 1
fi

# Crear directorio de backups si no existe
mkdir -p "${BACKUP_DIR}"

echo "📦 Creando backup: ${BACKUP_FILE}"
echo "   Timestamp: $(date)"

pg_dump "${DATABASE_URL}" \
  --no-owner \
  --no-acl \
  --clean \
  --if-exists \
  > "${BACKUP_FILE}"

FILESIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ Backup creado exitosamente: ${FILESIZE}"
echo "📋 Para restaurar: psql \${DATABASE_URL} < ${BACKUP_FILE}"
