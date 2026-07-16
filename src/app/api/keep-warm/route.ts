import { NextResponse } from 'next/server'

/**
 * Keep-warm — mantiene caliente la función serverless de Node en `gru1`.
 *
 * Por qué existe: en plan Hobby con tráfico bajo, las instancias escalan a cero
 * y la primera visita paga un "cold start" (~1s de pantalla blanca). Ese golpe
 * pega justo cuando se demuestra la app (llevaba rato sin uso → está fría).
 * Un ping periódico despierta la función y la mantiene viva, así el arranque en
 * frío casi nunca le toca a un usuario real.
 *
 * QUIÉN LO PINGUEA: un job pg_cron en Supabase ('keep-warm-golfers') cada 2 min
 * vía pg_net (ver scripts/keep-warm-cron.sql). Antes lo hacía GitHub Actions,
 * pero GitHub estrangula los cron de repos inactivos (corría cada 1-3h, no cada
 * 5 min) y no mantenía nada caliente. El workflow keep-warm.yml quedó como ping
 * manual de respaldo (workflow_dispatch), sin schedule.
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
