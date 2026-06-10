export const SUPPORT_STATUS_LABELS: Record<string, string> = {
  received: 'Recibido',
  in_review: 'En revision',
  in_progress: 'En progreso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export const SUPPORT_CATEGORY_LABELS: Record<string, string> = {
  bug: 'Error',
  access: 'Acceso',
  data: 'Datos',
  billing: 'Facturacion',
  other: 'Otro',
}

export const SUPPORT_SEVERITY_LABELS: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

export function formatSupportStatus(status: string) {
  return SUPPORT_STATUS_LABELS[status] ?? status.replaceAll('_', ' ')
}

export function formatSupportCategory(category: string) {
  return SUPPORT_CATEGORY_LABELS[category] ?? category
}

export function formatSupportSeverity(severity: string) {
  return SUPPORT_SEVERITY_LABELS[severity] ?? severity
}
