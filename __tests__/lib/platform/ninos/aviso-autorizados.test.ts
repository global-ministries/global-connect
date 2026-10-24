import { armarCorreosAutorizados, parseAvisoAutorizados } from '@/lib/platform/ninos/aviso-autorizados'

describe('pickup-change email (M6c)', () => {
  it('parses the recipients, dropping rows without an email', () => {
    expect(parseAvisoAutorizados(null)).toBeNull()
    const a = parseAvisoAutorizados({
      cambio_id: 'c1',
      nino_nombre: 'Sofía',
      actor_nombre: 'Rita Gómez',
      autorizados: [{ nombre: 'Tía Ana', relacion: 'Tía' }, { nombre: 'Vecino', relacion: ' ' }],
      destinatarios: [{ id: 'p2', nombre: 'Olga', email: 'olga@example.test' }, { id: 'p3', nombre: 'Sin', email: '' }],
    })
    expect(a?.destinatarios).toEqual([{ id: 'p2', nombre: 'Olga', email: 'olga@example.test' }])
    expect(a?.autorizados).toEqual([{ nombre: 'Tía Ana', relacion: 'Tía' }, { nombre: 'Vecino', relacion: null }])
  })

  it('builds one email per other parent with the new list', () => {
    const [correo, ...resto] = armarCorreosAutorizados({
      cambioId: 'c1',
      ninoNombre: 'Sofía',
      actorNombre: 'Rita Gómez',
      autorizados: [{ nombre: 'Tía Ana', relacion: 'Tía' }, { nombre: 'Vecino', relacion: null }],
      destinatarios: [{ id: 'p2', nombre: 'Olga', email: 'olga@example.test' }],
    })
    expect(resto).toHaveLength(0)
    expect(correo).toEqual({
      to: 'olga@example.test',
      subject: 'Cambió la lista de quién puede retirar a Sofía',
      nombre: 'Olga',
      lineas: [
        'Rita Gómez actualizó en Mis hijos las personas autorizadas para retirar a Sofía. La lista ahora es:',
        'Tía Ana (Tía)',
        'Vecino',
      ],
      idempotencyKey: 'ninos-autorizados-c1-p2',
    })
  })

  it('says so when the list was emptied', () => {
    const [correo] = armarCorreosAutorizados({
      cambioId: 'c1', ninoNombre: 'Sofía', actorNombre: 'Rita', autorizados: [],
      destinatarios: [{ id: 'p2', nombre: 'Olga', email: 'olga@example.test' }],
    })
    expect(correo.lineas[1]).toBe('Ya no hay personas autorizadas en la lista.')
  })
})
