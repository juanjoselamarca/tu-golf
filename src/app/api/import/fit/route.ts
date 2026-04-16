import { NextResponse } from 'next/server'

export async function POST() {
  return NextResponse.json(
    { error: 'Importación de archivos .FIT próximamente disponible', code: 'not_implemented' },
    { status: 501 }
  )
}
