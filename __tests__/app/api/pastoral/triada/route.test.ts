/**
 * @jest-environment node
 */


import { GET as getTriada, POST as postTriada } from '@/app/api/pastoral/triada/route'
import { GET as getTriadaById } from '@/app/api/pastoral/triada/[id]/route'
import { GET as getNotes, POST as postNotes } from '@/app/api/pastoral/triada/[id]/notes/route'
import { POST as confirmTriada } from '@/app/api/pastoral/triada/[id]/confirm/route'
import { POST as disbandTriada } from '@/app/api/pastoral/triada/[id]/disband/route'

describe('pastoral triada API routes', () => {
  it.each([
    ['GET /api/pastoral/triada', () => getTriada()],
    ['POST /api/pastoral/triada', () => postTriada()],
    ['GET /api/pastoral/triada/[id]', () => getTriadaById()],
    ['GET /api/pastoral/triada/[id]/notes', () => getNotes()],
    ['POST /api/pastoral/triada/[id]/notes', () => postNotes()],
    ['POST /api/pastoral/triada/[id]/confirm', () => confirmTriada()],
    ['POST /api/pastoral/triada/[id]/disband', () => disbandTriada()],
  ])('%s returns 404 without invoking business logic', async (_route, invoke) => {
    const response = await invoke()

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'Not found' })
  })
})
