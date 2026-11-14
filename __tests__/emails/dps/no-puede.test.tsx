/**
 * T16b (odd/tasks/dps-asistencia-pco.md, S14.4, S14.5; artboard
 * design/dps-avisos-correo/04) — the e-mail to the planner when someone
 * answers «No puedo»: the subject says who, which day and puesto; the motivo
 * as written (or «No escribió motivo»); «Buscar reemplazo» opens the plan;
 * «Cómo queda el puesto» with each person's state in text; replying writes to
 * the person who cannot; the same in plain text. Every person is fictitious.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import { NoPuedeEmail, asuntoNoPuede, textoNoPuede, type NoPuedeEmailProps } from '@/emails/dps/no-puede'

const BASE: NoPuedeEmailProps = {
  nombre: 'Andrés',
  persona: 'Óscar Rivas',
  fecha: '2026-11-15',
  contexto: 'Tu casa tiene influencers · Parte 4',
  roles: [{ nombre: 'Cámara 2', equipo: 'Video' }],
  horarios: ['09:00', '11:30'],
  motivo: 'Estoy de viaje a Mérida ese fin de semana.',
  // 21:14 in Caracas, Thursday 12.
  respondidoAt: '2026-11-13T01:14:00Z',
  // Monday 9, 18:42 in Caracas.
  enviadoAt: '2026-11-09T22:42:00Z',
  puestos: [
    {
      nombre: 'Cámara 2',
      equipo: 'Video',
      cantidad: 3,
      cubiertos: 2,
      personas: [
        { nombre: 'Daniela Montes', estado: 'confirmo' },
        { nombre: 'Óscar Rivas', estado: 'no_puede' },
        { nombre: 'Esteban Yánez', estado: 'pendiente' },
      ],
    },
  ],
  urlPlan: 'https://connect.example/dps/plan?plan=p15',
  respondeA: true,
}

describe('NoPuedeEmail', () => {
  it('has a subject that reads from the inbox', () => {
    expect(asuntoNoPuede(BASE)).toBe('Óscar Rivas no puede el domingo 15 · Cámara 2')
  })

  it('shows who, the motivo, when, the replacement button and how the puesto stands', () => {
    const h = renderToStaticMarkup(<NoPuedeEmail {...BASE} />)
    expect(h).toContain('logo-global.png')
    expect(h).toContain('Óscar Rivas no puede el domingo 15')
    expect(h).toContain('¡Hola, Andrés! Óscar respondió «No puedo» al aviso que enviaste el lunes 9.')
    expect(h).toContain('«Estoy de viaje a Mérida ese fin de semana.»')
    expect(h).toContain('Jueves 12 de noviembre, 21:14')
    expect(h).toContain('href="https://connect.example/dps/plan?plan=p15"')
    expect(h).toContain('Buscar reemplazo')
    expect(h).toContain('Cómo queda el puesto')
    expect(h).toContain('Cámara 2: 2 de 3')
    expect(h).toContain('Falta 1 persona')
    expect(h).toContain('Daniela Montes')
    expect(h).toContain('· Confirmó')
    expect(h).toContain('· No puede')
    expect(h).toContain('· Pendiente')
    expect(h).toContain('Si respondes este correo, le escribes a Óscar.')
  })

  it('says when there is no motivo and does not offer replying without the person’s e-mail', () => {
    const h = renderToStaticMarkup(<NoPuedeEmail {...BASE} motivo={null} respondeA={false} />)
    expect(h).toContain('No escribió motivo')
    expect(h).not.toContain('Si respondes este correo')
  })

  it('has a plain-text version with the same data and the plan link', () => {
    const t = textoNoPuede(BASE)
    expect(t).toContain('Óscar Rivas no puede el domingo 15')
    expect(t).toContain('Puesto: Cámara 2 · Video')
    expect(t).toContain('Motivo: «Estoy de viaje a Mérida ese fin de semana.»')
    expect(t).toContain('Respondió: Jueves 12 de noviembre, 21:14')
    expect(t).toContain('Buscar reemplazo:\nhttps://connect.example/dps/plan?plan=p15')
    expect(t).toContain('CÁMARA 2: 2 DE 3 (falta 1 persona)')
    expect(t).toContain('Óscar Rivas · No puede')
    expect(t).not.toMatch(/<[a-z]/i)
  })

  it('reads a complete puesto as such', () => {
    const t = textoNoPuede({ ...BASE, puestos: [{ ...BASE.puestos[0], cantidad: 2 }] })
    expect(t).toContain('CÁMARA 2: 2 DE 2 (completo)')
  })
})

describe('EmailLayout footer for answerable e-mails', () => {
  it('replaces «no respondas» with who receives the reply', () => {
    const h = renderToStaticMarkup(<NoPuedeEmail {...BASE} />)
    expect(h).not.toContain('no respondas directamente')
    expect(h).toContain('Si respondes este correo, le escribes a')
  })

  it('keeps the default footer when replying is not possible', () => {
    const h = renderToStaticMarkup(<NoPuedeEmail {...BASE} respondeA={false} />)
    expect(h).toContain('no respondas directamente')
  })
})
