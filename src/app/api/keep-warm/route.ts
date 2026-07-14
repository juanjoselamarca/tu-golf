import { NextResponse } from 'next/server'

/**
 * Keep-warm — mantiene caliente la función serverless de Node en `gru1`.
 *
 * Por qué existe: en plan Hobby con tráfico bajo, las instancias escalan a cero
 * y la primera visita paga un "cold start" (~1s de pantalla blanca). Ese golpe
 * pega justo cuando se demuestra la app (llevaba rato sin uso → está fría).
 * Un ping periódico (GitHub Actions, cada 5 min) despierta la función y la
 * mantiene viva, así el arranque en frío casi nunca le toca a un usuario real.
 *
 * A propósito NO toca la base de datos: solo tiene que arrancar el runtime de
 * Node. Pegarle a `/api/health` (que hace query a Supabase) cada 5 min sería
 * carga innecesaria. Este endpoint es lo más liviano posible.
 */
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export function GET() {
  return NextResponse.json(
    { warm: true, timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
