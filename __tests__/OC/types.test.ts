/**
 * S02 TDD RED — types module
 * Verifies Operating Core type exports compile correctly and invariant helpers exist.
 */
import type {
  // Events
  OperatingCoreEventKind,
  OperatingCoreEvent,
  OperatingCoreEventInstance,
  // Services
  OperatingCoreService,
  // Registrations
  OperatingCoreRegistration,
  OperatingCoreRegistrationConfirmationMode,
  OperatingCoreRegistrationOutcome,
  // Capacity
  OperatingCoreCapacityBase,
  OperatingCoreCapacityOverride,
  OperatingCoreEffectiveCapacity,
  // Forms
  OperatingCoreFormDefinition,
  OperatingCoreFormField,
  OperatingCoreFormFieldType,
  OperatingCoreFormLifecycle,
  OperatingCoreFormSubmission,
  // Resources
  OperatingCoreResource,
  OperatingCoreResourceType,
  OperatingCoreResourceLifecycle,
  // Notifications
  OperatingCoreNotificationChannel,
  OperatingCoreNotificationState,
  OperatingCoreNotificationOutbox,
  // Recurrent events
  OperatingCoreRecurrenceRule,
  OperatingCoreRecurrenceFreq,
  // GDV bridge
  OperatingCoreGDVAttendanceEvent,
  // Visitor resolution
  OperatingCoreVisitorResolutionResult,
  OperatingCoreVisitorResolutionMethod,
  OperatingCoreVisitorCandidate,
  // Participation
  OperatingCoreParticipationEvent,
} from '@/lib/platform/operating-core/types'

// ---------------------------------------------------------------------------
// Smoke tests — compile-time type checks that verify the type exists and
// has the expected shape. These would fail to compile if types are missing.
// ---------------------------------------------------------------------------

describe('OperatingCoreEventKind', () => {
  it('should accept valid event kinds', () => {
    const accept = (_: OperatingCoreEventKind) => { void _ }
    accept('service')
    accept('group_meeting')
    accept('workshop')
    accept('activity')
    accept('custom')
  })

  it('should reject camp (not implemented)', () => {
    const accept = (_: OperatingCoreEventKind) => { void _ }
    // @ts-expect-error — 'camp' is NOT a valid OperatingCoreEventKind
    accept('camp')
  })

  it('should reject other invalid kinds', () => {
    const accept = (_: OperatingCoreEventKind) => { void _ }
    // @ts-expect-error — invalid kind must be rejected
    accept('party')
    // @ts-expect-error — invalid kind must be rejected
    accept('meeting')
  })
})

describe('OperatingCoreRegistrationConfirmationMode', () => {
  it('should accept automatic and manual', () => {
    const m: OperatingCoreRegistrationConfirmationMode = 'automatic'
    const m2: OperatingCoreRegistrationConfirmationMode = 'manual'
    expect(m).toBe('automatic')
    expect(m2).toBe('manual')
  })

  it('should reject invalid modes', () => {
    const accept = (_: OperatingCoreRegistrationConfirmationMode) => { void _ }
    // @ts-expect-error — invalid mode must be rejected
    accept('auto')
    // @ts-expect-error — invalid mode must be rejected
    accept('semi-automatic')
  })
})

describe('OperatingCoreRegistrationOutcome', () => {
  it('should accept confirmed, waitlisted, rejected', () => {
    const o: OperatingCoreRegistrationOutcome = 'confirmed'
    const o2: OperatingCoreRegistrationOutcome = 'waitlisted'
    const o3: OperatingCoreRegistrationOutcome = 'rejected'
    expect(o).toBe('confirmed')
    expect(o2).toBe('waitlisted')
    expect(o3).toBe('rejected')
  })
})

describe('OperatingCoreFormFieldType', () => {
  it('should accept all 10 canonical field types', () => {
    const t: OperatingCoreFormFieldType = 'text'
    const t2: OperatingCoreFormFieldType = 'email'
    const t3: OperatingCoreFormFieldType = 'phone'
    const t4: OperatingCoreFormFieldType = 'number'
    const t5: OperatingCoreFormFieldType = 'date'
    const t6: OperatingCoreFormFieldType = 'select'
    const t7: OperatingCoreFormFieldType = 'multiselect'
    const t8: OperatingCoreFormFieldType = 'checkbox'
    const t9: OperatingCoreFormFieldType = 'textarea'
    expect(t).toBe('text')
    expect(t2).toBe('email')
    expect(t3).toBe('phone')
    expect(t4).toBe('number')
    expect(t5).toBe('date')
    expect(t6).toBe('select')
    expect(t7).toBe('multiselect')
    expect(t8).toBe('checkbox')
    expect(t9).toBe('textarea')
  })

  it('should reject invalid field types', () => {
    const accept = (_: OperatingCoreFormFieldType) => { void _ }
    // @ts-expect-error — invalid field type must be rejected
    accept('radio')
    // @ts-expect-error — invalid field type must be rejected
    accept('file')
  })
})

describe('OperatingCoreFormLifecycle', () => {
  it('should accept draft, published, archived', () => {
    const l: OperatingCoreFormLifecycle = 'draft'
    const l2: OperatingCoreFormLifecycle = 'published'
    const l3: OperatingCoreFormLifecycle = 'archived'
    expect(l).toBe('draft')
    expect(l2).toBe('published')
    expect(l3).toBe('archived')
  })
})

describe('OperatingCoreResourceType', () => {
  it('should accept link, file, video', () => {
    const t: OperatingCoreResourceType = 'link'
    const t2: OperatingCoreResourceType = 'file'
    const t3: OperatingCoreResourceType = 'video'
    expect(t).toBe('link')
    expect(t2).toBe('file')
    expect(t3).toBe('video')
  })
})

describe('OperatingCoreResourceLifecycle', () => {
  it('should accept active and archived', () => {
    const l: OperatingCoreResourceLifecycle = 'active'
    const l2: OperatingCoreResourceLifecycle = 'archived'
    expect(l).toBe('active')
    expect(l2).toBe('archived')
  })
})

describe('OperatingCoreNotificationChannel', () => {
  it('should accept in_app and email only (no SMS/WhatsApp)', () => {
    const c: OperatingCoreNotificationChannel = 'in_app'
    const c2: OperatingCoreNotificationChannel = 'email'
    expect(c).toBe('in_app')
    expect(c2).toBe('email')
  })

  it('should reject SMS and WhatsApp', () => {
    const accept = (_: OperatingCoreNotificationChannel) => { void _ }
    // @ts-expect-error — SMS not supported
    accept('sms')
    // @ts-expect-error — WhatsApp not supported
    accept('whatsapp')
  })
})

describe('OperatingCoreNotificationState', () => {
  it('should accept pending, sent, read, failed', () => {
    const s: OperatingCoreNotificationState = 'pending'
    const s2: OperatingCoreNotificationState = 'sent'
    const s3: OperatingCoreNotificationState = 'read'
    const s4: OperatingCoreNotificationState = 'failed'
    expect(s).toBe('pending')
    expect(s2).toBe('sent')
    expect(s3).toBe('read')
    expect(s4).toBe('failed')
  })
})

describe('OperatingCoreRecurrenceFreq', () => {
  it('should accept weekly only', () => {
    const f: OperatingCoreRecurrenceFreq = 'weekly'
    expect(f).toBe('weekly')
  })

  it('should reject other frequencies', () => {
    const accept = (_: OperatingCoreRecurrenceFreq) => { void _ }
    // @ts-expect-error — only weekly supported
    accept('daily')
    // @ts-expect-error — only weekly supported
    accept('monthly')
  })
})

describe('OperatingCoreVisitorResolutionMethod', () => {
  it('should accept cedula_exact and persona_candidate', () => {
    const m: OperatingCoreVisitorResolutionMethod = 'cedula_exact'
    const m2: OperatingCoreVisitorResolutionMethod = 'persona_candidate'
    expect(m).toBe('cedula_exact')
    expect(m2).toBe('persona_candidate')
  })
})

describe('OperatingCoreVisitorResolutionResult', () => {
  it('should accept resolved, ambiguous, no_match', () => {
    const r: OperatingCoreVisitorResolutionResult = 'resolved'
    const r2: OperatingCoreVisitorResolutionResult = 'ambiguous'
    const r3: OperatingCoreVisitorResolutionResult = 'no_match'
    expect(r).toBe('resolved')
    expect(r2).toBe('ambiguous')
    expect(r3).toBe('no_match')
  })
})

// ---------------------------------------------------------------------------
// Structural shape tests — verify key fields exist on exported interfaces
// ---------------------------------------------------------------------------

describe('OperatingCoreEvent interface', () => {
  it('should have required fields', () => {
    const event: OperatingCoreEvent = {
      id: 'evt-1',
      serviceId: 'svc-1',
      kind: 'workshop',
      estado: 'active',
      title: 'Workshop',
      startTime: '2026-01-01T10:00:00Z',
      visibilityScope: 'grupos_vida',
      recurrenceRule: null,
      parentEventId: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(event.kind).toBe('workshop')
    expect(event.estado).toBe('active')
  })
})

describe('OperatingCoreEventInstance interface', () => {
  it('should have required fields', () => {
    const instance: OperatingCoreEventInstance = {
      id: 'inst-1',
      eventId: 'evt-1',
      instanceDate: '2026-01-01',
      estado: 'active',
      capacityOperativa: 30,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(instance.capacityOperativa).toBe(30)
  })
})

describe('OperatingCoreService interface', () => {
  it('should have required fields', () => {
    const svc: OperatingCoreService = {
      id: 'svc-1',
      campusId: 'campus-1',
      kind: 'service',
      label: 'Sunday Service',
      weekday: 0,
      startTime: '10:00',
      estado: 'active',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(svc.kind).toBe('service')
    expect(svc.weekday).toBe(0)
  })
})

describe('OperatingCoreRegistration interface', () => {
  it('should have required fields including 6-state registrationState', () => {
    const reg: OperatingCoreRegistration = {
      id: 'reg-1',
      eventInstanceId: 'inst-1',
      personId: 'person-1',
      registrationState: 'pendiente',
      confirmationMode: 'automatic',
      waitlistPosition: null,
      outcome: 'waitlisted',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(reg.registrationState).toBe('pendiente')
    expect(reg.outcome).toBe('waitlisted')
  })
})

describe('OperatingCoreCapacityBase interface', () => {
  it('should have required fields', () => {
    const cap: OperatingCoreCapacityBase = {
      eventInstanceId: 'inst-1',
      capacityBase: 50,
      setBy: 'person-1',
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(cap.capacityBase).toBe(50)
  })
})

describe('OperatingCoreCapacityOverride interface', () => {
  it('should have required fields', () => {
    const ov: OperatingCoreCapacityOverride = {
      eventInstanceId: 'inst-1',
      capacityOperativa: 40,
      reason: 'venue layout',
      setBy: 'person-1',
      setAt: '2026-01-01T00:00:00Z',
    }
    expect(ov.capacityOperativa).toBe(40)
    expect(ov.reason).toBe('venue layout')
  })
})

describe('OperatingCoreEffectiveCapacity interface', () => {
  it('should expose source label', () => {
    const ec: OperatingCoreEffectiveCapacity = {
      eventInstanceId: 'inst-1',
      effectiveCapacity: 40,
      source: 'override',
      setBy: 'person-1',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(ec.source).toBe('override')
  })
})

describe('OperatingCoreFormDefinition interface', () => {
  it('should have required fields', () => {
    const form: OperatingCoreFormDefinition = {
      id: 'form-1',
      experienciaScope: 'grupos_vida',
      title: 'Test Form',
      description: 'A test',
      lifecycle: 'published',
      fields: [],
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(form.lifecycle).toBe('published')
  })
})

describe('OperatingCoreFormField interface', () => {
  it('should have required fields', () => {
    const field: OperatingCoreFormField = {
      label: 'Name',
      type: 'text',
      required: true,
    }
    expect(field.type).toBe('text')
    expect(field.required).toBe(true)
  })
})

describe('OperatingCoreFormSubmission interface', () => {
  it('should have required fields', () => {
    const sub: OperatingCoreFormSubmission = {
      id: 'sub-1',
      formId: 'form-1',
      personId: 'person-1',
      data: {},
      submittedAt: '2026-01-01T00:00:00Z',
    }
    expect(sub.formId).toBe('form-1')
  })
})

describe('OperatingCoreResource interface', () => {
  it('should have required fields', () => {
    const res: OperatingCoreResource = {
      id: 'res-1',
      tipo: 'link',
      title: 'Link',
      description: 'A link resource',
      url: 'https://example.com',
      visibility: 'public',
      lifecycle: 'active',
      ownerScope: 'grupos_vida',
      createdBy: 'person-1',
      successorId: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }
    expect(res.tipo).toBe('link')
    expect(res.visibility).toBe('public')
  })
})

describe('OperatingCoreNotificationOutbox interface', () => {
  it('should have required fields', () => {
    const outbox: OperatingCoreNotificationOutbox = {
      id: 'notif-1',
      templateKey: 'registration_confirmed.v1',
      recipientPersonId: 'person-1',
      channel: 'in_app',
      state: 'pending',
      payload: {},
      nextRetryAt: null,
      failedAt: null,
      createdAt: '2026-01-01T00:00:00Z',
    }
    expect(outbox.state).toBe('pending')
    expect(outbox.channel).toBe('in_app')
  })
})

describe('OperatingCoreRecurrenceRule interface', () => {
  it('should have required fields', () => {
    const rule: OperatingCoreRecurrenceRule = {
      freq: 'weekly',
      interval: 1,
      count: null,
      until: null,
      byDay: [0],
      startTime: '10:00',
    }
    expect(rule.freq).toBe('weekly')
    expect(rule.interval).toBe(1)
  })
})

describe('OperatingCoreGDVAttendanceEvent interface', () => {
  it('should have required fields', () => {
    const evt: OperatingCoreGDVAttendanceEvent = {
      id: 'gdv-1',
      gruposVidaReunionId: 'gv-meeting-1',
      personId: 'person-1',
      fecha: '2026-01-01',
      estado: 'asistio',
      emittedAt: '2026-01-01T00:00:00Z',
    }
    expect(evt.estado).toBe('asistio')
  })
})

describe('OperatingCoreVisitorCandidate interface', () => {
  it('should have required fields', () => {
    const cand: OperatingCoreVisitorCandidate = {
      personId: 'person-1',
      matchedSignals: ['cedula'],
      reviewRequired: false,
    }
    expect(cand.matchedSignals).toContain('cedula')
    expect(cand.reviewRequired).toBe(false)
  })
})

describe('OperatingCoreParticipationEvent interface', () => {
  it('should have required fields', () => {
    const evt: OperatingCoreParticipationEvent = {
      id: 'pe-1',
      eventInstanceId: 'inst-1',
      personId: 'person-1',
      kind: 'registration',
      metadata: {},
      capturedBy: 'person-1',
      captureSource: 'manual',
      emittedAt: '2026-01-01T00:00:00Z',
    }
    expect(evt.kind).toBe('registration')
    expect(evt.captureSource).toBe('manual')
  })
})
