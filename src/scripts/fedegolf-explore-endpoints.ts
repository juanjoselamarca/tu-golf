/**
 * Exploración de endpoints desconocidos de FedeGolf.
 * Probamos varias acciones candidatas contra ajax.php y json.php para
 * encontrar el endpoint que devuelve yardajes hoyo por hoyo.
 */
import { config } from 'dotenv'
import { resolve } from 'path'

// Cargar envs ANTES de importar módulos que leen process.env en top-level
config({ path: resolve(process.cwd(), '.env.local') })

const BASE_URL = 'https://www.fedegolf.cl'

async function tryEndpoint(session: { cookie: string }, path: string, params: Record<string, string>): Promise<{ ok: boolean; status: number; body: string }> {
  try {
    const body = new URLSearchParams(params)
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': session.cookie,
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body.toString(),
      redirect: 'manual',
    })
    const text = await res.text()
    return { ok: res.ok || res.status === 302, status: res.status, body: text.slice(0, 500) }
  } catch (e) {
    return { ok: false, status: 0, body: (e as Error).message }
  }
}

async function main() {
  // Dynamic imports después de cargar dotenv
  const { fedegolfLogin } = await import('../lib/fedegolf/client')
  const { decrypt } = await import('../lib/fedegolf/crypto')

  const rut = process.env.FEDEGOLF_RUT!
  const passEnc = process.env.FEDEGOLF_PASSWORD!
  // Si el password tiene formato iv:tag:data → decrypt, si no → plano
  const password = passEnc.includes(':') && passEnc.split(':').length === 3
    ? decrypt(passEnc)
    : passEnc

  console.log(`Login como ${rut}...`)
  const session = await fedegolfLogin(rut, password)
  console.log('✓ Login OK\n')

  // Parámetros base para una cancha conocida (Los Leones = club 17, cancha 25 según lo que vi)
  // Primero hay que saber IDs reales, busquemos los del primer club
  const clubId = '33' // Prince Of Wales según fedegolf-sync, cambio si hace falta
  const canchaId = '69' // probable

  // Lista de endpoints + acciones candidatas
  const candidates: Array<{ path: string; params: Record<string, string>; label: string }> = [
    // ajax.php variantes
    { path: '/sistema/admin/modMantenedorCanchas/ajax.php', params: { accion: 'ObtenerHoyos', club: clubId, cancha: canchaId }, label: 'ajax:ObtenerHoyos' },
    { path: '/sistema/admin/modMantenedorCanchas/ajax.php', params: { accion: 'ObtenerHoyosCancha', club: clubId, cancha: canchaId }, label: 'ajax:ObtenerHoyosCancha' },
    { path: '/sistema/admin/modMantenedorCanchas/ajax.php', params: { accion: 'CargaHoyos', club: clubId, cancha: canchaId }, label: 'ajax:CargaHoyos' },
    { path: '/sistema/admin/modMantenedorCanchas/ajax.php', params: { accion: 'ObtenerTarjeton', club: clubId, cancha: canchaId }, label: 'ajax:ObtenerTarjeton' },
    { path: '/sistema/admin/modMantenedorCanchas/ajax.php', params: { accion: 'ObtenerDistancias', club: clubId, cancha: canchaId }, label: 'ajax:ObtenerDistancias' },
    // json.php variantes (usan 'action')
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_hoyos_cancha', club: clubId, cancha: canchaId }, label: 'json:get_hoyos_cancha' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_tarjeton_cancha', club: clubId, cancha: canchaId }, label: 'json:get_tarjeton_cancha' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_tarjeton', club: clubId, cancha: canchaId }, label: 'json:get_tarjeton' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_distancias', club: clubId, cancha: canchaId }, label: 'json:get_distancias' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_yardajes', club: clubId, cancha: canchaId }, label: 'json:get_yardajes' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'get_info_hoyos', club: clubId, cancha: canchaId }, label: 'json:get_info_hoyos' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'info_tarjeton', club: clubId, cancha: canchaId }, label: 'json:info_tarjeton' },
    { path: '/sistema/admin/modMantenedorCanchas/json.php', params: { action: 'GetTarjeton', club: clubId, cancha: canchaId }, label: 'json:GetTarjeton' },
    // Otro módulo: modTarjeton o similar
    { path: '/sistema/admin/modTarjeton/json.php', params: { action: 'get_tarjeton', club: clubId, cancha: canchaId }, label: 'modTarjeton:get_tarjeton' },
    { path: '/sistema/admin/modTarjetones/json.php', params: { action: 'get_tarjeton', club: clubId, cancha: canchaId }, label: 'modTarjetones:get_tarjeton' },
    { path: '/sistema/admin/modHoyos/ajax.php', params: { accion: 'ObtenerHoyos', club: clubId, cancha: canchaId }, label: 'modHoyos:ObtenerHoyos' },
    { path: '/sistema/admin/modHoyos/json.php', params: { action: 'get_hoyos', club: clubId, cancha: canchaId }, label: 'modHoyos:get_hoyos' },
  ]

  console.log(`Probando ${candidates.length} endpoints con club=${clubId} cancha=${canchaId}...\n`)

  for (const c of candidates) {
    const r = await tryEndpoint(session, c.path, c.params)
    const hit = r.body.includes('yard') || r.body.includes('distan') || r.body.includes('hoyo') || r.body.includes('par') || r.body.includes('metros')
    const prefix = hit ? '🔍' : (r.ok ? ' ✓' : ' ✗')
    console.log(`${prefix} [${r.status}] ${c.label}`)
    if (r.body.length > 20) {
      console.log(`     ${r.body.slice(0, 200).replace(/\n/g, ' ')}...`)
    }
    console.log()
    await new Promise(rs => setTimeout(rs, 200))
  }

  // También probar páginas HTML de admin (quizás el tarjetón viene embebido)
  console.log('\n--- Páginas HTML admin (quizás embeben el tarjetón) ---\n')
  const htmlPaths = [
    `/sistema/admin/modMantenedorCanchas/?club=${clubId}&cancha=${canchaId}`,
    `/sistema/admin/modMantenedorCanchas/editar.php?club=${clubId}&cancha=${canchaId}`,
    `/sistema/admin/modMantenedorCanchas/ver.php?club=${clubId}&cancha=${canchaId}`,
    `/sistema/admin/modMantenedorCanchas/tarjeton.php?club=${clubId}&cancha=${canchaId}`,
    `/sistema/admin/modMantenedorCanchas/hoyos.php?club=${clubId}&cancha=${canchaId}`,
  ]
  for (const p of htmlPaths) {
    try {
      const res = await fetch(`${BASE_URL}${p}`, {
        headers: { 'Cookie': session.cookie, 'X-Requested-With': 'XMLHttpRequest' },
        redirect: 'manual',
      })
      const text = await res.text()
      const hasYards = /yard|distan|hoyo|par\s*\d|metros/i.test(text)
      console.log(`${hasYards ? '🔍' : ' ✓'} [${res.status}] ${p} (${text.length} bytes)`)
      if (hasYards) {
        const matches = text.match(/yarda[js]*|distanc\w+|hoyo|metros/gi)?.slice(0, 10).join(', ')
        console.log(`     keywords: ${matches}`)
      }
    } catch (e) {
      console.log(` ✗ ERROR ${p}: ${(e as Error).message}`)
    }
    await new Promise(r => setTimeout(r, 200))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
