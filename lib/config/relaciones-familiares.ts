// ConfiguraciÃ³n para relaciones familiares
export const RELACIONES_FAMILIARES = {
  // Relaciones que requieren inversiÃ³n cuando el usuario actual es usuario1_id
  RELACIONES_INVERTIBLES: {
    'padre': 'hijo',
    'hijo': 'padre',
    'tutor': 'tutelado',
    'hermano': 'hermano', // Los hermanos son recÃ­procos (no se invierten)
  },
  
  // Relaciones que son recÃ­procas (no se invierten)
  RELACIONES_RECIPROCAS: ['conyuge', 'hermano', 'otro_familiar'],

  // Nombres en español para cada tipo de relación
  NOMBRES_ESPANOL: {
    'conyuge': 'Cónyuge',
    'padre': 'Padre',
    'hijo': 'Hijo/a',
    'hermano': 'Hermano/a',
    'tutor': 'Tutor',
    'tutelado': 'Tutelado/a',
    'otro_familiar': 'Otro Familiar',
  },
  
  // Colores para cada tipo de relaciÃ³n
  COLORS: {
    'conyuge': 'from-pink-500 to-pink-600',
    'padre': 'from-blue-500 to-blue-600',
    'hijo': 'from-green-500 to-green-600',
    'hermano': 'from-indigo-500 to-indigo-600',
    'tutor': 'from-purple-500 to-purple-600',
    'tutelado': 'from-purple-400 to-purple-500',
    'otro_familiar': 'from-gray-500 to-gray-600',
  }
} as const

// FunciÃ³n para obtener el nombre en espaÃ±ol de una relaciÃ³n
export function obtenerNombreRelacion(tipoRelacion: string, familiar?: any): string {
  // Si tenemos informaciÃ³n del familiar, usar gÃ©nero especÃ­fico
  if (familiar && familiar.genero) {
    switch (tipoRelacion) {
      case 'padre':
        return familiar.genero === 'Femenino' ? 'Madre' : 'Padre'
      case 'hijo':
        return familiar.genero === 'Femenino' ? 'Hija' : 'Hijo'
      case 'hermano':
        return familiar.genero === 'Femenino' ? 'Hermana' : 'Hermano'
      case 'tutor':
        return familiar.genero === 'Femenino' ? 'Tutora' : 'Tutor'
      case 'tutelado':
        return familiar.genero === 'Femenino' ? 'Tutelada' : 'Tutelado'
    }
  }
  
  // Si no hay gÃ©nero o es otro tipo, usar nombres genÃ©ricos
  return RELACIONES_FAMILIARES.NOMBRES_ESPANOL[tipoRelacion as keyof typeof RELACIONES_FAMILIARES.NOMBRES_ESPANOL] || 
         tipoRelacion.charAt(0).toUpperCase() + tipoRelacion.slice(1)
}

// FunciÃ³n para obtener el color de una relaciÃ³n
export function obtenerColorRelacion(tipoRelacion: string): string {
  return RELACIONES_FAMILIARES.COLORS[tipoRelacion as keyof typeof RELACIONES_FAMILIARES.COLORS] || 
         'from-orange-500 to-orange-600'
}

// FunciÃ³n para invertir una relaciÃ³n
export function invertirRelacion(tipoRelacion: string): string | null {
  return RELACIONES_FAMILIARES.RELACIONES_INVERTIBLES[tipoRelacion as keyof typeof RELACIONES_FAMILIARES.RELACIONES_INVERTIBLES] || null
}

// FunciÃ³n para verificar si una relaciÃ³n es recÃ­proca
export function esRelacionReciproca(tipoRelacion: string): boolean {
  return RELACIONES_FAMILIARES.RELACIONES_RECIPROCAS.includes(tipoRelacion as any)
}
