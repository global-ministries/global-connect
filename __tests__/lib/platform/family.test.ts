import {
  PLATFORM_FAMILY_RELATION_TYPES,
  PLATFORM_FUTURE_FAMILY_RELATION_TYPES,
  PLATFORM_FAMILY_RELATION_LABELS,
  type PlatformFamilyRelationType,
  type PlatformAnyFamilyRelationType,
  type PlatformFutureFamilyRelationType,
  isPlatformFamilyRelationType,
  isPlatformAnyFamilyRelationType,
  isPlatformFutureFamilyRelationType,
  normalizePlatformFamilyRelationType,
  isPlatformReciprocalFamilyRelation,
  invertPlatformFamilyRelation,
  normalizePlatformPersonaId,
} from '@/lib/platform/family'

describe('lib/platform/family', () => {
  describe('taxonomy constants', () => {
    it('exposes the 6 current DB relation types in order', () => {
      expect(PLATFORM_FAMILY_RELATION_TYPES).toEqual([
        'conyuge',
        'padre',
        'hijo',
        'tutor',
        'hermano',
        'otro_familiar',
      ])
    })

    it('exposes the 2 future relation types', () => {
      expect(PLATFORM_FUTURE_FAMILY_RELATION_TYPES).toEqual(['autorizado', 'contacto'])
    })
  })

  describe('normalizePlatformPersonaId', () => {
    it('returns trimmed string for valid persona ids', () => {
      expect(normalizePlatformPersonaId('persona-1')).toBe('persona-1')
      expect(normalizePlatformPersonaId('  persona-1  ')).toBe('persona-1')
    })

    it('returns undefined for blank or whitespace-only strings', () => {
      expect(normalizePlatformPersonaId('')).toBeUndefined()
      expect(normalizePlatformPersonaId('   ')).toBeUndefined()
      expect(normalizePlatformPersonaId('\t\n  ')).toBeUndefined()
    })

    it('returns undefined for non-string values', () => {
      expect(normalizePlatformPersonaId(null)).toBeUndefined()
      expect(normalizePlatformPersonaId(undefined)).toBeUndefined()
      expect(normalizePlatformPersonaId(123)).toBeUndefined()
      expect(normalizePlatformPersonaId(false)).toBeUndefined()
      expect(normalizePlatformPersonaId({})).toBeUndefined()
      expect(normalizePlatformPersonaId([])).toBeUndefined()
    })
  })

  describe('isPlatformFamilyRelationType', () => {
    it.each(PLATFORM_FAMILY_RELATION_TYPES)('returns true for current type "%s"', (type) => {
      expect(isPlatformFamilyRelationType(type)).toBe(true)
    })

    it.each(PLATFORM_FUTURE_FAMILY_RELATION_TYPES)('returns false for future type "%s"', (type) => {
      expect(isPlatformFamilyRelationType(type)).toBe(false)
    })

    it('returns false for non-string values', () => {
      const invalid = [null, undefined, '', 0, false, [], {}, '42', 'Padre', 'PADRE']
      for (const value of invalid) {
        expect(isPlatformFamilyRelationType(value)).toBe(false)
      }
    })

    it('narrows type at compile time', () => {
      const value: unknown = 'padre'
      if (isPlatformFamilyRelationType(value)) {
        const narrowed: PlatformFamilyRelationType = value
        expect(narrowed).toBe('padre')
      } else {
        throw new Error('expected narrowing')
      }
    })
  })

  describe('isPlatformAnyFamilyRelationType', () => {
    it.each([...PLATFORM_FAMILY_RELATION_TYPES, ...PLATFORM_FUTURE_FAMILY_RELATION_TYPES])('returns true for any known type "%s"', (type) => {
      expect(isPlatformAnyFamilyRelationType(type)).toBe(true)
    })

    it('returns false for invalid values', () => {
      const invalid = [null, undefined, '', 0, false, [], {}, 'desconocido', 'Padre', 'PADRE']
      for (const value of invalid) {
        expect(isPlatformAnyFamilyRelationType(value)).toBe(false)
      }
    })

    it('narrows type at compile time', () => {
      const value: unknown = 'contacto'
      if (isPlatformAnyFamilyRelationType(value)) {
        const narrowed: PlatformAnyFamilyRelationType = value
        expect(narrowed).toBe('contacto')
      } else {
        throw new Error('expected narrowing')
      }
    })
  })

  describe('isPlatformFutureFamilyRelationType', () => {
    it.each(PLATFORM_FUTURE_FAMILY_RELATION_TYPES)('returns true for future type "%s"', (type) => {
      expect(isPlatformFutureFamilyRelationType(type)).toBe(true)
    })

    it.each(PLATFORM_FAMILY_RELATION_TYPES)('returns false for current type "%s"', (type) => {
      expect(isPlatformFutureFamilyRelationType(type)).toBe(false)
    })

    it('returns false for non-string values', () => {
      const invalid = [null, undefined, '', 0, false, [], {}, '42']
      for (const value of invalid) {
        expect(isPlatformFutureFamilyRelationType(value)).toBe(false)
      }
    })

    it('returns false for mixed-case future inputs', () => {
      expect(isPlatformFutureFamilyRelationType('Autorizado')).toBe(false)
      expect(isPlatformFutureFamilyRelationType('CONTACTO')).toBe(false)
      expect(isPlatformFutureFamilyRelationType('  autorizado  ')).toBe(false)
    })

    it('narrows type at compile time', () => {
      const value: unknown = 'autorizado'
      if (isPlatformFutureFamilyRelationType(value)) {
        const narrowed: PlatformFutureFamilyRelationType = value
        expect(narrowed).toBe('autorizado')
      } else {
        throw new Error('expected narrowing')
      }
    })
  })

  describe('normalizePlatformFamilyRelationType', () => {
    it.each(PLATFORM_FAMILY_RELATION_TYPES)('returns "%s" for exact lowercase input', (type) => {
      expect(normalizePlatformFamilyRelationType(type)).toBe(type)
    })

    it('normalizes mixed-case input to lowercase', () => {
      expect(normalizePlatformFamilyRelationType('Padre')).toBe('padre')
      expect(normalizePlatformFamilyRelationType('PADRE')).toBe('padre')
      expect(normalizePlatformFamilyRelationType('Hermano')).toBe('hermano')
      expect(normalizePlatformFamilyRelationType('CONYUGE')).toBe('conyuge')
    })

    it('trims whitespace before matching', () => {
      expect(normalizePlatformFamilyRelationType('  padre  ')).toBe('padre')
      expect(normalizePlatformFamilyRelationType('\thijo\n')).toBe('hijo')
      expect(normalizePlatformFamilyRelationType('  Padre ')).toBe('padre')
    })

    it('returns undefined for whitespace-only input', () => {
      expect(normalizePlatformFamilyRelationType('   ')).toBeUndefined()
      expect(normalizePlatformFamilyRelationType('\t\n  ')).toBeUndefined()
    })

    it('returns undefined for future, unknown and non-string values', () => {
      expect(normalizePlatformFamilyRelationType('autorizado')).toBeUndefined()
      expect(normalizePlatformFamilyRelationType('contacto')).toBeUndefined()
      expect(normalizePlatformFamilyRelationType('desconocido')).toBeUndefined()
      expect(normalizePlatformFamilyRelationType(null)).toBeUndefined()
      expect(normalizePlatformFamilyRelationType(undefined)).toBeUndefined()
      expect(normalizePlatformFamilyRelationType('')).toBeUndefined()
      expect(normalizePlatformFamilyRelationType(0)).toBeUndefined()
      expect(normalizePlatformFamilyRelationType(false)).toBeUndefined()
      expect(normalizePlatformFamilyRelationType([])).toBeUndefined()
      expect(normalizePlatformFamilyRelationType({})).toBeUndefined()
    })
  })

  describe('isPlatformReciprocalFamilyRelation', () => {
    it('returns true for reciprocal relations', () => {
      expect(isPlatformReciprocalFamilyRelation('conyuge')).toBe(true)
      expect(isPlatformReciprocalFamilyRelation('hermano')).toBe(true)
    })

    it('returns false for non-reciprocal relations', () => {
      expect(isPlatformReciprocalFamilyRelation('padre')).toBe(false)
      expect(isPlatformReciprocalFamilyRelation('hijo')).toBe(false)
      expect(isPlatformReciprocalFamilyRelation('tutor')).toBe(false)
      expect(isPlatformReciprocalFamilyRelation('otro_familiar')).toBe(false)
    })
  })

  describe('invertPlatformFamilyRelation', () => {
    it('inverts parent/child relations', () => {
      expect(invertPlatformFamilyRelation('padre')).toBe('hijo')
      expect(invertPlatformFamilyRelation('hijo')).toBe('padre')
    })

    it('returns the same type for symmetric relations', () => {
      expect(invertPlatformFamilyRelation('conyuge')).toBe('conyuge')
      expect(invertPlatformFamilyRelation('hermano')).toBe('hermano')
    })

    it('returns null for relations with no symmetric DB term', () => {
      expect(invertPlatformFamilyRelation('tutor')).toBeNull()
      expect(invertPlatformFamilyRelation('otro_familiar')).toBeNull()
    })

    it.each([
      ['conyuge', 'conyuge'],
      ['padre', 'hijo'],
      ['hijo', 'padre'],
      ['hermano', 'hermano'],
    ])('is involutive for symmetric/asymmetric type "%s"', (type, expected) => {
      const once = invertPlatformFamilyRelation(type as PlatformFamilyRelationType)
      expect(once).toBe(expected)
      expect(invertPlatformFamilyRelation(once)).toBe(type)
    })

    it('round-trips asymmetric types through null', () => {
      expect(invertPlatformFamilyRelation('tutor')).toBeNull()
      expect(invertPlatformFamilyRelation(null)).toBeNull()
      expect(invertPlatformFamilyRelation('otro_familiar')).toBeNull()
      expect(invertPlatformFamilyRelation(null)).toBeNull()
    })
  })

  describe('PLATFORM_FAMILY_RELATION_LABELS', () => {
    it('has a non-empty Spanish label for every current and future type', () => {
      const allTypes: PlatformAnyFamilyRelationType[] = [
        ...PLATFORM_FAMILY_RELATION_TYPES,
        ...PLATFORM_FUTURE_FAMILY_RELATION_TYPES,
      ]
      for (const type of allTypes) {
        const label = PLATFORM_FAMILY_RELATION_LABELS[type]
        expect(typeof label).toBe('string')
        expect(label.trim().length).toBeGreaterThan(0)
      }
    })

    it('uses reasonable Spanish labels for the 6 current types', () => {
      expect(PLATFORM_FAMILY_RELATION_LABELS.conyuge).toBe('Cónyuge')
      expect(PLATFORM_FAMILY_RELATION_LABELS.padre).toBe('Padre / Madre')
      expect(PLATFORM_FAMILY_RELATION_LABELS.hijo).toBe('Hijo / Hija')
      expect(PLATFORM_FAMILY_RELATION_LABELS.tutor).toBe('Tutor')
      expect(PLATFORM_FAMILY_RELATION_LABELS.hermano).toBe('Hermano / Hermana')
      expect(PLATFORM_FAMILY_RELATION_LABELS.otro_familiar).toBe('Otro familiar')
    })

    it('includes placeholder labels for future types', () => {
      expect(PLATFORM_FAMILY_RELATION_LABELS.autorizado).toBe('Autorizado')
      expect(PLATFORM_FAMILY_RELATION_LABELS.contacto).toBe('Contacto')
    })
  })
})
