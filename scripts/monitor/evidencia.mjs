/**
 * Evidencia de una caída, juntada SIN modelos (determinista, barata y repetible). La usa
 * scripts/monitor/incidente.mjs para que la sesión de diagnóstico razone sobre datos, no sobre suposiciones.
 *
 * Qué junta (cada fuente es independiente: si una falla, queda su error y sigue con las demás):
 *   - salud por servicio según Supabase (Management API /health)
 *   - memoria, swap, IO de disco e iowait de la instancia (endpoint Prometheus, 2 muestras a 20 s)
 *   - logs de la última hora: peticiones y errores por 5 min, quién pide (origen), errores de Postgres
 *   - qué cambió: commits a main y corridas de CI recientes (gh), por si fue un deploy
 * Lo que cuesta caro (el congelamiento del 02-oct) se ve en swap/IO/iowait; lo que es código, en commits/CI.
 */
import { execFileSync } from 'node:child_process'
import { projectRefDe } from '../lib/supabase-ref.mjs'

const TIMEOUT = 20_000

async function intentar(nombre, fn) {
  try { return await fn() } catch (e) { return { error: `${nombre}: ${e.message}` } }
}

async function getJson(url, headers) {
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT) })
  const t = await r.text()
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${t.slice(0, 200)}`)
  return JSON.parse(t)
}

/** Métricas de la instancia (Prometheus). Valores puntuales + tasas entre 2 muestras. */
async function metricas(env, ref) {
  const leer = async () => {
    const r = await fetch(`https://${ref}.supabase.co/customer/v1/privileged/metrics`, {
      headers: { Authorization: 'Basic ' + Buffer.from(`service_role:${env.SUPABASE_SERVICE_ROLE_KEY}`).toString('base64') },
      signal: AbortSignal.timeout(TIMEOUT),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const v = { iowait: 0, idle: 0 }
    for (const l of (await r.text()).split('\n')) {
      const m = l.match(/^(\w+)\{([^}]*)\} (\S+)$/); if (!m) continue
      const [, n, lab, val] = m
      if (n === 'node_memory_MemTotal_bytes') v.memTotal = +val
      if (n === 'node_memory_MemAvailable_bytes') v.memDisponible = +val
      if (n === 'node_memory_SwapTotal_bytes') v.swapTotal = +val
      if (n === 'node_memory_SwapFree_bytes') v.swapLibre = +val
      if (n === 'node_disk_read_bytes_total' && lab.includes('device="nvme0n1"')) v.lecturaRaiz = +val
      if (n === 'node_vmstat_pgmajfault') v.fallosPagina = +val
      if (n === 'node_cpu_seconds_total' && lab.includes('mode="iowait"')) v.iowait += +val
      if (n === 'node_cpu_seconds_total' && lab.includes('mode="idle"')) v.idle += +val
    }
    return v
  }
  const a = await leer(); await new Promise(r => setTimeout(r, 20_000)); const b = await leer()
  const MB = x => Math.round(x / 1e6)
  return {
    memoria_total_mb: MB(b.memTotal), memoria_disponible_mb: MB(b.memDisponible),
    swap_usado_mb: MB(b.swapTotal - b.swapLibre), swap_usado_pct: Math.round(100 * (b.swapTotal - b.swapLibre) / b.swapTotal),
    lectura_disco_raiz_mb_s: +((b.lecturaRaiz - a.lecturaRaiz) / 20e6).toFixed(1),
    fallos_pagina_por_min: Math.round((b.fallosPagina - a.fallosPagina) * 3),
    iowait_pct: Math.round(100 * (b.iowait - a.iowait) / Math.max(1e-9, (b.iowait - a.iowait) + (b.idle - a.idle))),
    nota: 'Instancia free (Nano): disco con base de ~5 MB/s y ráfaga de ~30 min/día. Lectura sostenida muy sobre eso + swap alto = congelamiento por IO (02-oct).',
  }
}

async function logs(env, ref, sql, horas = 1) {
  const fin = new Date(), ini = new Date(fin - horas * 3600e3)
  const u = `https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs?sql=${encodeURIComponent(sql)}&iso_timestamp_start=${ini.toISOString()}&iso_timestamp_end=${fin.toISOString()}`
  return (await getJson(u, { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` })).result
}

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', timeout: TIMEOUT, windowsHide: true }).trim()
}

export async function juntarEvidencia({ env = process.env, repoRoot }) {
  const ref = projectRefDe(env.NEXT_PUBLIC_SUPABASE_URL)
  const api = { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` }
  const [salud, inst, porTramo, origen, errores5xx, postgres] = await Promise.all([
    intentar('salud', () => getJson(`https://api.supabase.com/v1/projects/${ref}/health?services=db,auth,rest,realtime,pooler`, api)),
    intentar('métricas', () => metricas(env, ref)),
    intentar('logs por tramo', () => logs(env, ref, "select toStartOfFiveMinutes(timestamp) t, count() n, countIf(toInt32OrZero(log_attributes['response.status_code'])>=500) e5xx, round(quantile(0.95)(toFloat64OrZero(log_attributes['response.origin_time']))) p95_ms from logs where source='edge_logs' group by t order by t")),
    intentar('logs por origen', () => logs(env, ref, "select multiIf(log_attributes['request.cf.country']='CL','PC local de Juanjo (scripts/agentes)', log_attributes['request.cf.region']='São Paulo','Vercel prod (la app)', log_attributes['request.cf.region']='Virginia','Vercel preview', log_attributes['request.headers.user_agent'] ilike '%Mozilla%','navegador', 'GitHub Actions / otro') origen, count() n from logs where source='edge_logs' group by origen order by n desc")),
    intentar('5xx por ruta', () => logs(env, ref, "select splitByChar('?', log_attributes['request.path'])[1] ruta, log_attributes['response.status_code'] st, count() n from logs where source='edge_logs' and toInt32OrZero(log_attributes['response.status_code'])>=500 group by ruta, st order by n desc limit 15")),
    intentar('postgres', () => logs(env, ref, "select toStartOfFiveMinutes(timestamp) t, substring(event_message,1,160) msg, count() n from logs where source='postgres_logs' and (log_attributes['error_severity'] in ('ERROR','FATAL','PANIC') or event_message ilike '%timeout%' or event_message ilike '%terminat%' or event_message ilike '%checkpoint%') group by t, msg order by t desc limit 30")),
  ])
  const cambios = await intentar('cambios', async () => ({
    commits_main_6h: sh('git', ['log', 'origin/main', '--since=6 hours ago', '--format=%cI %h %s'], repoRoot).split('\n').filter(Boolean),
    ci_reciente: JSON.parse(sh('gh', ['run', 'list', '--limit', '15', '--json', 'name,status,conclusion,createdAt,headBranch,event'], repoRoot)),
  }))
  return { tomada: new Date().toISOString(), proyecto: ref, salud, instancia: inst, logs_ultima_hora: { por_tramo_5min: porTramo, por_origen: origen, errores_5xx: errores5xx, postgres }, cambios }
}
