import { NextResponse } from 'next/server'

const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 })

export function GET() {
  return notFound()
}

export function POST() {
  return notFound()
}
