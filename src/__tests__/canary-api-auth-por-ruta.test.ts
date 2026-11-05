// Canario: ninguna ruta de API entra a `main` sin autenticar, salvo que esté
// declarada acá como pública con su motivo.
//
// Por qué existe (auditoría de auth del 05-nov-2026): las 119 rutas se sondearon
// sin sesión contra producción y las 133 combinaciones ruta+método respondieron
// bien (112 con 401/403; las otras 21 son públicas por diseño o validan el body
// antes de autenticar). Ese estado no lo fijaba nada: un `route.ts` nuevo que se
// olvidara del guard pasaba tsc, tests y build, y `src/proxy.ts` no cubre `/api`
// (solo redirige páginas). Este canario lo frena en el PR.
//
// Qué mira, por cada handler exportado (GET/POST/PUT/PATCH/DELETE):
//   - `api/admin/**` → guard de ADMIN (`isAdmin(` o `isCerebroAdmin(`).
//   - `api/cron/**`  → `CRON_SECRET`.
//   - el resto       → guard de sesión o de secreto compartido,
//                      o estar en `SIN_GUARD` con su motivo.
// El guard cuenta si está en el cuerpo del handler o en un helper del mismo
// archivo que el handler llama (ej. `getAuthUser()` en `/api/game`).
//
// Qué NO mira: que el resultado del guard se use bien (una sesión leída y después
// ignorada pasa). Eso lo cubren los tests de cada ruta y la sonda contra prod.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative, sep } from 'path'

const API = join(process.cwd(), 'src', 'app', 'api')

/** Lee la sesión del usuario (cookie de Supabase verificada en el servidor). */
const GUARD_SESION = /auth\.getUser\(|auth\.getClaims\(/
/** Exige rol admin. `isAdmin` y `isCerebroAdmin` leen la sesión por dentro o la reciben ya leída. */
const GUARD_ADMIN = /\bisAdmin\(|\bisCerebroAdmin\(/
/** Secretos compartidos de máquina a máquina (cron de Vercel, callback del E2E, bot de Telegram). */
const GUARD_SECRETO = /process\.env\.(CRON_SECRET|E2E_CALLBACK_SECRET|TELEGRAM_WEBHOOK_SECRET|INBOX_SETUP_SECRET)\b/
const GUARD_CRON = /process\.env\.CRON_SECRET\b/

/**
 * Handlers sin ningún guard, con el motivo. Clave: `<MÉTODO> <ruta sin /api>`.
 * Agregar una fila acá es una decisión de seguridad: el motivo tiene que decir
 * qué expone la ruta y por qué eso puede verlo cualquiera.
 */
const SIN_GUARD: Record<string, string> = {
  'GET demo/players': 'datos de demostración escritos en el código; no lee la base',
  'GET demo/profile': 'perfil de demostración escrito en el código; no lee la base',
  'GET en-vivo': 'feed público de rondas en juego, leído con el cliente anónimo bajo RLS',
  'GET health': 'ping de salud para el monitor; responde ok/latencia, sin datos',
  'GET keep-warm': 'ping que mantiene caliente la función; no toca la base',
  'GET pga-live': 'marcador del PGA Tour tomado de una fuente pública',
  'POST import/fit': 'responde 501 fijo (función no implementada); no lee el body',
  'POST push/resubscribe':
    'lo llama el service worker, sin cookies; la prueba de posesión es el endpoint + auth de la suscripción vieja',
  'GET ronda-libre/[codigo]/live':
    'board público de la ronda para quien tiene el código; no lee perfiles (el course handicap va por /hcp, con sesión)',
  'GET torneo/[slug]/live':
    'board público del torneo; en un torneo neto el visor sin sesión ve solo el bruto (el neto va por /neto, con sesión)',
  'GET tarjeta/[id]/jugador': 'nombre del dueño de una tarjeta que él mismo hizo pública',
  'GET torneos/[slug]/nombres': 'los mismos nombres que el board público; solo torneos visibles públicamente',
  'POST torneos/[slug]/guest-join':
    'inscripción de invitado sin cuenta: valida guestId, nombre, índice, estado y cupo del torneo; rate limit por IP',
  'GET torneos/[slug]/guest-player': 'el invitado sin cuenta se identifica con su guest token (403 sin él)',
}

/** Rutas bajo `admin/` que no usan guard de admin, con el motivo. */
const ADMIN_POR_SECRETO: Record<string, string> = {
  'POST admin/e2e/runs/[id]/callback':
    'lo llama GitHub Actions, sin sesión: autentica con el header x-e2e-callback-secret (E2E_CALLBACK_SECRET)',
}

type Ofensa = { handler: string; falta: 'sesion' | 'admin' | 'cron' }

const RE_HANDLER = /^export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/gm
/** Declaraciones de primer nivel: cortan el cuerpo de un handler o de un helper. */
const RE_TOP = /^(?:export\s+)?(?:async\s+function|function|const|let|type|interface|class)\s+(\w+)/gm

/**
 * Handlers de un `route.ts` que no cumplen la regla de su zona.
 * `ruta` va sin `/api` y sin `/route.ts` (ej. `torneos/[slug]/start`).
 */
export function ofensasDeRuta(ruta: string, src: string): Ofensa[] {
  const cortes = [...src.matchAll(RE_TOP)].map((m) => ({ nombre: m[1], inicio: m.index ?? 0 }))
  const cuerpo = (inicio: number) => {
    const sig = cortes.find((c) => c.inicio > inicio)
    return src.slice(inicio, sig ? sig.inicio : src.length)
  }
  // Helpers del archivo (no handlers), con su cuerpo: el guard puede vivir ahí.
  const helpers = cortes
    .filter((c) => !/^(GET|POST|PUT|PATCH|DELETE)$/.test(c.nombre))
    .map((c) => ({ nombre: c.nombre, cuerpo: cuerpo(c.inicio) }))
  const cumple = (texto: string, guard: RegExp) =>
    guard.test(texto) || helpers.some((h) => new RegExp(`\\b${h.nombre}\\(`).test(texto) && guard.test(h.cuerpo))

  const ofensas: Ofensa[] = []
  for (const m of src.matchAll(RE_HANDLER)) {
    const handler = `${m[1]} ${ruta}`
    const texto = cuerpo(m.index ?? 0)
    if (ruta.startsWith('admin/')) {
      const ok = handler in ADMIN_POR_SECRETO ? cumple(texto, GUARD_SECRETO) : cumple(texto, GUARD_ADMIN)
      if (!ok) ofensas.push({ handler, falta: 'admin' })
    } else if (ruta.startsWith('cron/')) {
      if (!cumple(texto, GUARD_CRON)) ofensas.push({ handler, falta: 'cron' })
    } else if (!cumple(texto, GUARD_SESION) && !cumple(texto, GUARD_ADMIN) && !cumple(texto, GUARD_SECRETO)) {
      ofensas.push({ handler, falta: 'sesion' })
    }
  }
  return ofensas
}

function rutas(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) return rutas(p)
    return f === 'route.ts' ? [p] : []
  })
}

const archivos = rutas(API).map((p) => ({
  ruta: relative(API, p).split(sep).join('/').replace(/\/route\.ts$/, ''),
  src: readFileSync(p, 'utf8'),
}))
const handlers = archivos.flatMap((a) => [...a.src.matchAll(RE_HANDLER)].map((m) => `${m[1]} ${a.ruta}`))
const ofensas = archivos.flatMap((a) => ofensasDeRuta(a.ruta, a.src))

describe('canario — cada ruta de API autentica o está declarada pública', () => {
  it('el barrido ve las rutas de verdad (no pasa en vacío)', () => {
    expect(archivos.length).toBeGreaterThanOrEqual(100)
    expect(handlers.length).toBeGreaterThanOrEqual(archivos.length)
    // Todo `route.ts` exporta al menos un handler que el canario reconoce.
    const sinHandler = archivos.filter((a) => ![...a.src.matchAll(RE_HANDLER)].length).map((a) => a.ruta)
    expect(sinHandler).toEqual([])
  })

  it('todo handler de api/admin exige admin (o su secreto declarado)', () => {
    expect(ofensas.filter((o) => o.falta === 'admin').map((o) => o.handler)).toEqual([])
  })

  it('todo handler de api/cron exige CRON_SECRET', () => {
    expect(ofensas.filter((o) => o.falta === 'cron').map((o) => o.handler)).toEqual([])
  })

  it('fuera de admin y cron, un handler sin guard tiene que estar en SIN_GUARD con su motivo', () => {
    const sinGuard = ofensas.filter((o) => o.falta === 'sesion').map((o) => o.handler)
    expect(sinGuard.filter((h) => !(h in SIN_GUARD))).toEqual([])
  })

  it('SIN_GUARD y ADMIN_POR_SECRETO no tienen filas viejas ni de más', () => {
    const sinGuard = new Set(ofensas.filter((o) => o.falta === 'sesion').map((o) => o.handler))
    // Una fila que ya no existe, o cuya ruta ahora sí autentica, se borra: la lista es el inventario exacto.
    expect(Object.keys(SIN_GUARD).filter((h) => !sinGuard.has(h))).toEqual([])
    expect(Object.keys(ADMIN_POR_SECRETO).filter((h) => !handlers.includes(h))).toEqual([])
    for (const motivo of [...Object.values(SIN_GUARD), ...Object.values(ADMIN_POR_SECRETO)]) {
      expect(motivo.length).toBeGreaterThanOrEqual(20)
    }
  })
})

describe('ofensasDeRuta — el analizador distingue lo que tiene que distinguir', () => {
  const SESION = `const { data: { user } } = await supabase.auth.getUser()\n  if (!user) return NextResponse.json({}, { status: 401 })`

  it('handler sin guard → falta sesión', () => {
    const src = `export async function POST(req: Request) {\n  const admin = createAdminClient()\n  return NextResponse.json(await admin.from('players').insert({}))\n}\n`
    expect(ofensasDeRuta('torneos/[slug]/nuevo', src)).toEqual([{ handler: 'POST torneos/[slug]/nuevo', falta: 'sesion' }])
  })

  it('handler con sesión → limpio', () => {
    const src = `export async function POST() {\n  ${SESION}\n  return NextResponse.json({})\n}\n`
    expect(ofensasDeRuta('perfil/x', src)).toEqual([])
  })

  it('un archivo con GET autenticado y DELETE sin guard marca solo el DELETE', () => {
    const src = `export async function GET() {\n  ${SESION}\n  return NextResponse.json({})\n}\n\nexport async function DELETE() {\n  return NextResponse.json({})\n}\n`
    expect(ofensasDeRuta('perfil/x', src)).toEqual([{ handler: 'DELETE perfil/x', falta: 'sesion' }])
  })

  it('el guard en un helper del archivo cuenta solo si el handler lo llama', () => {
    const helper = `async function getAuthUser() {\n  const supabase = await createClient()\n  return supabase.auth.getUser()\n}\n\n`
    const llama = `${helper}export async function PATCH() {\n  const user = await getAuthUser()\n  return NextResponse.json({ user })\n}\n`
    const noLlama = `${helper}export async function PATCH() {\n  return NextResponse.json({})\n}\n`
    expect(ofensasDeRuta('game', llama)).toEqual([])
    expect(ofensasDeRuta('game', noLlama)).toEqual([{ handler: 'PATCH game', falta: 'sesion' }])
  })

  it('en api/admin la sesión sola no alcanza: hace falta el guard de admin', () => {
    const soloSesion = `export async function GET() {\n  ${SESION}\n  return NextResponse.json({})\n}\n`
    const conAdmin = `export async function GET() {\n  const { data: { user } } = await supabase.auth.getUser()\n  if (!(await isAdmin(user?.id, supabase))) return NextResponse.json({}, { status: 403 })\n  return NextResponse.json({})\n}\n`
    expect(ofensasDeRuta('admin/usuarios', soloSesion)).toEqual([{ handler: 'GET admin/usuarios', falta: 'admin' }])
    expect(ofensasDeRuta('admin/usuarios', conAdmin)).toEqual([])
  })

  it('en api/cron hace falta CRON_SECRET; una sesión no lo reemplaza', () => {
    const soloSesion = `export async function GET() {\n  ${SESION}\n  return NextResponse.json({})\n}\n`
    const conSecreto = `export async function GET(req: Request) {\n  if (!esCronAutorizado(req.headers.get('authorization'), process.env.CRON_SECRET)) return new Response(null, { status: 401 })\n  return NextResponse.json({})\n}\n`
    expect(ofensasDeRuta('cron/limpieza', soloSesion)).toEqual([{ handler: 'GET cron/limpieza', falta: 'cron' }])
    expect(ofensasDeRuta('cron/limpieza', conSecreto)).toEqual([])
  })

  it('reconoce las tres formas de exportar un handler y archivos con CRLF', () => {
    const src = `export function GET() {\r\n  return NextResponse.json({})\r\n}\r\n\r\nexport const POST = async () => NextResponse.json({})\r\n`
    expect(ofensasDeRuta('x', src).map((o) => o.handler)).toEqual(['GET x', 'POST x'])
  })
})
