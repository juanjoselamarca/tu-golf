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
//   - `api/admin/**` → guard de ADMIN (`isAdmin(` o `isCerebroAdmin(`) y un rechazo 401/403.
//   - `api/cron/**`  → `CRON_SECRET` y un rechazo 401/403.
//   - el resto       → guard de sesión o de secreto compartido y un rechazo 401/403.
//                      Sin guard: fila en `SIN_GUARD`. Con guard pero sin rechazo
//                      (lee la sesión y atiende igual al anónimo): fila en
//                      `SESION_OPCIONAL`. Las dos listas llevan el motivo.
// El guard y el rechazo cuentan en el cuerpo del handler o en un helper del mismo
// archivo que el handler llama (ej. `getAuthUser()` en `/api/game`). Los
// comentarios no cuentan: se quitan antes de analizar.
//
// Qué NO mira: que el rechazo dependa del guard. Un handler que lee la sesión,
// responde 401 por otra cosa y atiende al anónimo pasa (hoy: `push/round-update`,
// que sin sesión acepta el `jugadorId` del invitado). Eso lo cubren los tests de
// cada ruta y la sonda sin sesión contra prod.
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
/** El handler le dice que no a alguien: sin esto, leer la sesión no protege nada. */
const RECHAZO = /status:\s*40[13]\b/
/** Comentarios de bloque y de línea (sin comerse el `//` de una URL dentro de un string). */
const COMENTARIOS = /\/\*[\s\S]*?\*\/|(?<![:'"`])\/\/.*$/gm

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
    'board público de la ronda para quien tiene el código; no lee perfiles: el handicap sale del índice anotado en la tarjeta, ' +
    'el de jugadores con cuenta sin índice en la tarjeta va por /hcp (con sesión), y en ronda neta va solo el bruto',
  'GET torneo/[slug]/live':
    'board público del torneo; en un torneo neto el visor sin sesión ve solo el bruto (el neto va por /neto, con sesión)',
  'GET tarjeta/[id]/jugador': 'nombre del dueño de una tarjeta que él mismo hizo pública',
  'GET torneos/[slug]/nombres': 'los mismos nombres que el board público; solo torneos visibles públicamente',
  'POST torneos/[slug]/guest-join':
    'inscripción de invitado sin cuenta: valida guestId, nombre, índice, estado y cupo del torneo; rate limit por IP',
  'GET torneos/[slug]/guest-player': 'el invitado sin cuenta se identifica con su guest token (403 sin él)',
}

/**
 * Handlers que leen la sesión pero atienden igual a quien no la tiene. Misma
 * regla que `SIN_GUARD`: el motivo dice qué recibe el anónimo.
 */
const SESION_OPCIONAL: Record<string, string> = {
  'GET gwi/ronda-libre/[codigo]':
    'el GWI de la ronda ya calculado; el anónimo recibe las filas enmascaradas por visor (publicarResultadoGWI)',
  'GET gwi/torneo/[slug]':
    'el GWI del torneo ya calculado; el anónimo recibe las filas enmascaradas por visor (publicarResultadoGWI)',
  'GET perfil/tee-prompt-status': 'sin sesión responde { show: false } fijo, sin leer la base',
  'POST push/follow':
    'seguir una ronda sin cuenta (decisión de producto 29-sep-2026): el watcher es la suscripción push del dispositivo, ' +
    'con prueba de posesión, tope de seguidores por ronda y rate limit por IP',
  'DELETE push/follow':
    'dejar de seguir sin cuenta: solo borra el watcher de la suscripción que prueba posesión (endpoint + auth)',
  'GET torneos/[slug]/join-info':
    'sin sesión entrega solo la info pública del torneo, el cupo y si admite invitados, para pintar la pantalla de unirse',
}

/** Rutas bajo `admin/` que no usan guard de admin, con el motivo. */
const ADMIN_POR_SECRETO: Record<string, string> = {
  'POST admin/e2e/runs/[id]/callback':
    'lo llama GitHub Actions, sin sesión: autentica con el header x-e2e-callback-secret (E2E_CALLBACK_SECRET)',
}

type Ofensa = { handler: string; falta: 'sesion' | 'rechazo' | 'admin' | 'cron' }

const RE_HANDLER = /^export\s+(?:async\s+function|function|const)\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/gm
/** Declaraciones de primer nivel: cortan el cuerpo de un handler o de un helper. */
const RE_TOP = /^(?:export\s+)?(?:async\s+function|function|const|let|type|interface|class)\s+(\w+)/gm

/**
 * Handlers de un `route.ts` que no cumplen la regla de su zona.
 * `ruta` va sin `/api` y sin `/route.ts` (ej. `torneos/[slug]/start`).
 */
export function ofensasDeRuta(ruta: string, fuente: string): Ofensa[] {
  const src = fuente.replace(COMENTARIOS, '')
  const cortes = [...src.matchAll(RE_TOP)].map((m) => ({ nombre: m[1], inicio: m.index ?? 0 }))
  const cuerpo = (inicio: number) => {
    const sig = cortes.find((c) => c.inicio > inicio)
    return src.slice(inicio, sig ? sig.inicio : src.length)
  }
  // Helpers del archivo (no handlers), con su cuerpo: el guard puede vivir ahí.
  const helpers = cortes
    .filter((c) => !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(c.nombre))
    .map((c) => ({ nombre: c.nombre, cuerpo: cuerpo(c.inicio) }))
  // `(?<![.\w$])`: la llamada al helper local, no un método de otro objeto (`req.headers.get(` no es `get()`).
  const cumple = (texto: string, guard: RegExp) =>
    guard.test(texto) ||
    helpers.some((h) => new RegExp(`(?<![.\\w$])${h.nombre}\\(`).test(texto) && guard.test(h.cuerpo))

  const ofensas: Ofensa[] = []
  for (const m of src.matchAll(RE_HANDLER)) {
    const handler = `${m[1]} ${ruta}`
    const texto = cuerpo(m.index ?? 0)
    const rechaza = cumple(texto, RECHAZO)
    if (ruta.startsWith('admin/')) {
      const ok = handler in ADMIN_POR_SECRETO ? cumple(texto, GUARD_SECRETO) : cumple(texto, GUARD_ADMIN)
      if (!ok || !rechaza) ofensas.push({ handler, falta: 'admin' })
    } else if (ruta.startsWith('cron/')) {
      if (!cumple(texto, GUARD_CRON) || !rechaza) ofensas.push({ handler, falta: 'cron' })
    } else if (!cumple(texto, GUARD_SESION) && !cumple(texto, GUARD_ADMIN) && !cumple(texto, GUARD_SECRETO)) {
      ofensas.push({ handler, falta: 'sesion' })
    } else if (!rechaza) {
      ofensas.push({ handler, falta: 'rechazo' })
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
    // El analizador quita comentarios antes de mirar: si un `/*` dentro de un string (`'image/*'`) se comiera un
    // handler entero, quedaría sin revisar. Los handlers del texto limpio tienen que ser los del texto crudo.
    const ciegos = archivos.filter((a) => [...a.src.replace(COMENTARIOS, '').matchAll(RE_HANDLER)].length !== [...a.src.matchAll(RE_HANDLER)].length)
    expect(ciegos.map((a) => a.ruta), 'quitar comentarios borra un handler: hay un /* dentro de un string').toEqual([])
    // Un handler re-exportado (`export { x as POST }`, `export * from`) no lo ve RE_HANDLER: hoy no hay ninguno.
    expect(archivos.filter((a) => /^export\s*(\{|\*)/m.test(a.src)).map((a) => a.ruta)).toEqual([])
  })

  it('todo handler de api/admin exige admin (o su secreto declarado)', () => {
    expect(ofensas.filter((o) => o.falta === 'admin').map((o) => o.handler), 'agrega isAdmin()/isCerebroAdmin() + un rechazo 401/403, o una fila en ADMIN_POR_SECRETO con motivo').toEqual([])
  })

  it('todo handler de api/cron exige CRON_SECRET', () => {
    expect(ofensas.filter((o) => o.falta === 'cron').map((o) => o.handler), 'agrega el chequeo de CRON_SECRET + un rechazo 401/403').toEqual([])
  })

  it('fuera de admin y cron, un handler sin guard tiene que estar en SIN_GUARD con su motivo', () => {
    const sinGuard = ofensas.filter((o) => o.falta === 'sesion').map((o) => o.handler)
    expect(sinGuard.filter((h) => !(h in SIN_GUARD)), 'agrega auth.getUser() + un rechazo 401/403, o una fila en SIN_GUARD con el motivo').toEqual([])
  })

  it('un handler que lee la sesión pero no rechaza a nadie tiene que estar en SESION_OPCIONAL con su motivo', () => {
    const sinRechazo = ofensas.filter((o) => o.falta === 'rechazo').map((o) => o.handler)
    expect(sinRechazo.filter((h) => !(h in SESION_OPCIONAL)), 'rechaza al anónimo con 401/403, o agrega una fila en SESION_OPCIONAL con el motivo').toEqual([])
  })

  it('SIN_GUARD, SESION_OPCIONAL y ADMIN_POR_SECRETO no tienen filas viejas ni de más', () => {
    const sinGuard = new Set(ofensas.filter((o) => o.falta === 'sesion').map((o) => o.handler))
    const sinRechazo = new Set(ofensas.filter((o) => o.falta === 'rechazo').map((o) => o.handler))
    expect(Object.keys(SESION_OPCIONAL).filter((h) => !sinRechazo.has(h)), 'buena noticia: estas rutas ya rechazan al anónimo (o no existen); borra su fila de SESION_OPCIONAL').toEqual([])
    // Una fila que ya no existe, o cuya ruta ahora sí autentica, se borra: la lista es el inventario exacto.
    expect(Object.keys(SIN_GUARD).filter((h) => !sinGuard.has(h)), 'buena noticia: estas rutas ya autentican (o no existen); borra su fila de SIN_GUARD').toEqual([])
    // La fila de secreto sobra si el handler no existe o si ya exige admin.
    const conAdmin = (h: string) => archivos.some((a) => h.endsWith(` ${a.ruta}`) && GUARD_ADMIN.test(a.src.replace(COMENTARIOS, '')))
    expect(Object.keys(ADMIN_POR_SECRETO).filter((h) => !handlers.includes(h) || conAdmin(h)), 'estas rutas ya no existen o ya exigen admin; borra su fila de ADMIN_POR_SECRETO').toEqual([])
    for (const motivo of [...Object.values(SIN_GUARD), ...Object.values(SESION_OPCIONAL), ...Object.values(ADMIN_POR_SECRETO)]) {
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
    const llama = `${helper}export async function PATCH() {\n  const user = await getAuthUser()\n  if (!user) return NextResponse.json({}, { status: 401 })\n  return NextResponse.json({ user })\n}\n`
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

  it('leer la sesión sin rechazar a nadie no es un guard: falta el rechazo', () => {
    const src = `export async function GET() {\n  const { data: { user } } = await supabase.auth.getUser()\n  return NextResponse.json(await leer(user?.id ?? null))\n}\n`
    expect(ofensasDeRuta('gwi/x', src)).toEqual([{ handler: 'GET gwi/x', falta: 'rechazo' }])
  })

  it('un comentario que nombra el guard no cuenta, ni el JSDoc del helper que viene después', () => {
    const src = `// valida con supabase.auth.getUser() y responde { status: 401 }\nexport async function POST() {\n  return NextResponse.json({})\n}\n\n/** Usa process.env.CRON_SECRET y auth.getUser( para autenticar. */\nfunction otro() {}\n`
    expect(ofensasDeRuta('x', src)).toEqual([{ handler: 'POST x', falta: 'sesion' }])
    // …y quitar comentarios no se come una URL dentro de un string.
    const conUrl = `export async function GET() {\n  const r = await fetch('https://ejemplo.cl/api')\n  ${SESION}\n  return NextResponse.json(r)\n}\n`
    expect(ofensasDeRuta('x', conUrl)).toEqual([])
  })

  it('reconoce las tres formas de exportar un handler y archivos con CRLF', () => {
    const src = `export function GET() {\r\n  return NextResponse.json({})\r\n}\r\n\r\nexport const POST = async () => NextResponse.json({})\r\n`
    expect(ofensasDeRuta('x', src).map((o) => o.handler)).toEqual(['GET x', 'POST x'])
  })
})
