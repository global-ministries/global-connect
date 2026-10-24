/**
 * N8/N9 — Niños email templates render the Spanish copy inside EmailLayout.
 */
import { renderToStaticMarkup } from 'react-dom/server'

import { InvitacionCuentaEmail } from '@/lib/email/invitacion-cuenta-email'
import { NinosBienvenidaEmail } from '@/lib/email/ninos-bienvenida-email'
import { NinosIngresoEmail } from '@/lib/email/ninos-ingreso-email'
import { NinosRetiroEmail } from '@/lib/email/ninos-retiro-email'

describe('Niños emails', () => {
  it('welcome', () => {
    const html = renderToStaticMarkup(<NinosBienvenidaEmail nombre="Ana" />)
    expect(html).toContain('Bienvenidos a Waumba Land / UpStreet')
    expect(html).toContain('Ana')
    expect(html).toContain('Yo Soy Global')
  })
  it('welcome points to Mis hijos', () => {
    const html = renderToStaticMarkup(
      <NinosBienvenidaEmail nombre="Ana" urlMisHijos="https://miembros.example/perfil#mis-hijos" />,
    )
    expect(html).toContain('Ver a mis hijos')
    expect(html).toContain('href="https://miembros.example/perfil#mis-hijos"')
    expect(html).toContain('Mi Perfil → Mis hijos')
  })
  it('account invitation from Niños says where the children are', () => {
    const conNinos = renderToStaticMarkup(<InvitacionCuentaEmail nombre="Ana" urlAceptar="https://x.example/a" deNinos />)
    expect(conNinos).toContain('Mi Perfil → Mis hijos')
    const sinNinos = renderToStaticMarkup(<InvitacionCuentaEmail nombre="Ana" urlAceptar="https://x.example/a" />)
    expect(sinNinos).not.toContain('Mis hijos')
  })
  it('check-in with the code', () => {
    const html = renderToStaticMarkup(<NinosIngresoEmail lineas={['Sofía ingresó a Preescolar II a las 9:05.']} codigo="4821" />)
    expect(html).toContain('Sofía ingresó a Preescolar II a las 9:05.')
    expect(html).toContain('Tu código de retiro es 4821.')
  })
  it('check-out', () => {
    const html = renderToStaticMarkup(<NinosRetiroEmail lineas={['Sofía fue retirada a las 10:42 por Ana.']} />)
    expect(html).toContain('Sofía fue retirada a las 10:42 por Ana.')
  })
})
