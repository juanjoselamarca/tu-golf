'use client'

import { useEffect, useState, useCallback } from 'react'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'
import { HealthGrid } from '@/components/admin/HealthGrid'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminBadge } from '@/components/admin/AdminBadge'

interface HealthData {
  services: {
    supabase: { ok: boolean; ms: number }
    espn: { ok: boolean; ms: number }
    claude: { ok: boolean; ms: number; status?: string }
    garmin: { ok: boolean; ms: number; status?: string }
    vercel: { ok: boolean; ms: number; commit?: string }
  }
  tables: Record<string, number>
  env: Record<string, boolean>
}

const sectionTitle = {
  ...adminFonts.sectionTitle,
  fontSize: '1.25rem',
  marginBottom: '16px',
}

const envNotes: Record<string, string> = {
  ANTHROPIC_API_KEY: 'tAIger AI coach',
  GARMIN_CLIENT_ID: 'Garmin Connect',
}

interface HealthCheckResult {
  timestamp: string
  duration_ms: number
  summary: { total: number; passed: number; warnings: number; failed: number }
  categories: {
    name: string
    checks: {
      name: string
      status: 'pass' | 'warn' | 'fail'
      message: string
      details?: unknown
      duration_ms?: number
    }[]
  }[]
}

export default function SistemaPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pingLoading, setPingLoading] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)
  const [hcResult, setHcResult] = useState<HealthCheckResult | null>(null)
  const [hcLoading, setHcLoading] = useState(false)
  const [debugResult, setDebugResult] = useState<string | null>(null)
  const [lastPing, setLastPing] = useState<string | null>(null)
  const [sqlQuery, setSqlQuery] = useState('')
  const [sqlResult, setSqlResult] = useState<Record<string, unknown>[] | null>(null)
  const [sqlLoading, setSqlLoading] = useState(false)
  const [sqlError, setSqlError] = useState<string | null>(null)
  const [forceCloseLoading, setForceCloseLoading] = useState(false)
  const [forceCloseResult, setForceCloseResult] = useState<{ count: number } | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/health')
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  const services = health
    ? [
        { name: 'Supabase', ...health.services.supabase },
        { name: 'Vercel', ...health.services.vercel },
        { name: 'ESPN API', ...health.services.espn },
        { name: 'Claude API', ...health.services.claude },
        { name: 'Garmin API', ...health.services.garmin },
      ]
    : []

  const handlePing = async () => {
    setPingLoading(true)
    setLastPing(null)
    try {
      const start = Date.now()
      const res = await fetch('/api/admin/health')
      const elapsed = Date.now() - start
      if (res.ok) {
        const data = await res.json()
        setHealth(data)
        setLastPing(`Ping completado en ${elapsed}ms — ${new Date().toLocaleTimeString()}`)
      } else {
        setLastPing(`Error: HTTP ${res.status}`)
      }
    } catch (err) {
      setLastPing(`Error de conexión: ${err instanceof Error ? err.message : 'desconocido'}`)
    } finally {
      setPingLoading(false)
    }
  }

  const handleDebugAuth = async () => {
    setDebugLoading(true)
    setDebugResult(null)
    try {
      const res = await fetch('/api/admin/debug-auth')
      const data = await res.json()
      setDebugResult(JSON.stringify(data, null, 2))
    } catch (err) {
      setDebugResult(`Error: ${err instanceof Error ? err.message : 'desconocido'}`)
    } finally {
      setDebugLoading(false)
    }
  }

  const handleForceClose = async () => {
    setForceCloseLoading(true)
    setForceCloseResult(null)
    try {
      const res = await fetch('/api/admin/actions/force-close', { method: 'POST' })
      const data = await res.json()
      setForceCloseResult({ count: data.closed ?? 0 })
    } catch {
      setForceCloseResult({ count: -1 })
    } finally {
      setForceCloseLoading(false)
    }
  }

  const handleSqlExecute = async () => {
    if (!sqlQuery.trim()) return
    setSqlLoading(true)
    setSqlResult(null)
    setSqlError(null)
    try {
      const res = await fetch('/api/admin/actions/sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sqlQuery }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSqlError(data.error || `HTTP ${res.status}`)
      } else {
        setSqlResult(Array.isArray(data.rows) ? data.rows : [])
      }
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setSqlLoading(false)
    }
  }

  // Auto-fix mapping: check name → fixId
  const AUTO_FIXES: Record<string, string> = {
    'Jugadores huerfanos': 'orphaned-jugadores',
    'Rounds huerfanos': 'orphaned-rounds',
    'Scores huerfanos': 'orphaned-scores',
    'Rondas abandonadas': 'abandoned-rondas',
    'Push duplicados': 'duplicate-push',
    'Estados rondas validos': 'invalid-ronda-estados',
  }

  const [fixingId, setFixingId] = useState<string | null>(null)
  const [fixResult, setFixResult] = useState<Record<string, string>>({})
  const [escalating, setEscalating] = useState(false)
  const [escalateResult, setEscalateResult] = useState<string | null>(null)

  const runHealthCheck = async () => {
    setHcLoading(true)
    setHcResult(null)
    setFixResult({})
    setEscalateResult(null)
    try {
      const res = await fetch('/api/admin/health-check')
      if (res.ok) setHcResult(await res.json())
    } catch { /* keep null */ }
    finally { setHcLoading(false) }
  }

  const runFix = async (fixId: string, checkName: string) => {
    setFixingId(fixId)
    try {
      const res = await fetch('/api/admin/health-check/fix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fixId }),
      })
      const data = await res.json()
      if (data.success) {
        setFixResult(prev => ({ ...prev, [checkName]: data.result.detail }))
      } else {
        setFixResult(prev => ({ ...prev, [checkName]: 'Error: ' + (data.error || 'desconocido') }))
      }
    } catch {
      setFixResult(prev => ({ ...prev, [checkName]: 'Error de conexion' }))
    } finally { setFixingId(null) }
  }

  const escalateToClaudeCode = async () => {
    if (!hcResult) return
    setEscalating(true)
    const failingChecks = hcResult.categories.flatMap(cat =>
      cat.checks.filter(c => c.status !== 'pass').map(c => ({
        name: c.name, status: c.status, message: c.message, category: cat.name,
      }))
    )
    try {
      const res = await fetch('/api/admin/health-check/escalate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checks: failingChecks }),
      })
      const data = await res.json()
      if (data.success && data.report) {
        // Download as .md file
        const blob = new Blob([data.report], { type: 'text/markdown' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `health-issue-${new Date().toISOString().split('T')[0]}.md`
        a.click()
        URL.revokeObjectURL(url)
        setEscalateResult('Reporte descargado. Enviaselo a Claude en tu proxima sesion.')
      }
    } catch {
      setEscalateResult('Error al generar reporte')
    } finally { setEscalating(false) }
  }

  const statusIcon = (s: string) => s === 'pass' ? '\u2705' : s === 'warn' ? '\u26A0\uFE0F' : '\u274C'
  const statusColor = (s: string) => s === 'pass' ? adminColors.green : s === 'warn' ? '#f59e0b' : adminColors.red

  const hasProblems = hcResult && (hcResult.summary.warnings > 0 || hcResult.summary.failed > 0)
  const hasUnfixableProblems = hcResult && hcResult.categories.some(cat =>
    cat.checks.some(c => c.status !== 'pass' && !AUTO_FIXES[c.name])
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Section: Health Check Suite */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>Health Check Suite</h2>
          <button onClick={runHealthCheck} disabled={hcLoading} style={{
            background: adminColors.gold, color: adminColors.bgDeep, border: 'none',
            borderRadius: '8px', padding: '10px 20px', fontSize: '13px', fontWeight: 700,
            cursor: hcLoading ? 'wait' : 'pointer', opacity: hcLoading ? 0.6 : 1,
          }}>
            {hcLoading ? 'Ejecutando...' : 'Ejecutar Tests'}
          </button>
        </div>

        {hcResult && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Summary bar */}
            <div style={{
              ...adminCard,
              background: hcResult.summary.failed > 0
                ? 'rgba(239,68,68,0.06)'
                : hcResult.summary.warnings > 0
                  ? 'rgba(245,158,11,0.06)'
                  : 'rgba(34,197,94,0.06)',
              border: `1px solid ${hcResult.summary.failed > 0 ? 'rgba(239,68,68,0.2)' : hcResult.summary.warnings > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexWrap: 'wrap', gap: '12px',
            }}>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                <span style={{ ...adminFonts.body, color: adminColors.green, fontWeight: 700 }}>
                  {'\u2705'} {hcResult.summary.passed} OK
                </span>
                {hcResult.summary.warnings > 0 && (
                  <span style={{ ...adminFonts.body, color: '#f59e0b', fontWeight: 700 }}>
                    {'\u26A0\uFE0F'} {hcResult.summary.warnings} atención
                  </span>
                )}
                {hcResult.summary.failed > 0 && (
                  <span style={{ ...adminFonts.body, color: adminColors.red, fontWeight: 700 }}>
                    {'\u274C'} {hcResult.summary.failed} problemas
                  </span>
                )}
              </div>
              <span style={{ ...adminFonts.mono, fontSize: '11px' }}>
                {hcResult.summary.total} checks en {hcResult.duration_ms}ms
              </span>
            </div>

            {/* Categories */}
            {hcResult.categories.map((cat, ci) => {
              const catHasIssues = cat.checks.some(c => c.status !== 'pass')
              return (
                <div key={ci} style={adminCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <h3 style={{ ...adminFonts.label, marginBottom: 0 }}>{cat.name}</h3>
                    {!catHasIssues && (
                      <span style={{ fontSize: '10px', color: adminColors.green, fontWeight: 600 }}>Todo OK</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {cat.checks.map((check, ki) => {
                      const fixId = AUTO_FIXES[check.name]
                      const isFixing = fixingId === fixId
                      const wasFixed = fixResult[check.name]
                      return (
                        <div key={ki} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '8px 10px', borderRadius: '8px',
                          background: check.status === 'fail' ? 'rgba(239,68,68,0.08)' : check.status === 'warn' ? 'rgba(245,158,11,0.06)' : 'transparent',
                          flexWrap: 'wrap',
                        }}>
                          <span style={{ fontSize: '16px', flexShrink: 0 }}>{statusIcon(check.status)}</span>
                          <span style={{ ...adminFonts.body, fontSize: '13px', flex: 1, minWidth: '120px' }}>{check.name}</span>
                          <span style={{ ...adminFonts.mono, fontSize: '11px', color: statusColor(check.status) }}>
                            {check.message}
                          </span>
                          {check.duration_ms !== undefined && (
                            <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.grayDim }}>
                              {check.duration_ms}ms
                            </span>
                          )}
                          {/* Auto-fix button */}
                          {check.status !== 'pass' && fixId && !wasFixed && (
                            <button
                              onClick={() => runFix(fixId, check.name)}
                              disabled={!!fixingId}
                              style={{
                                background: adminColors.gold, color: adminColors.bgDeep,
                                border: 'none', borderRadius: '6px', padding: '4px 12px',
                                fontSize: '11px', fontWeight: 700, cursor: isFixing ? 'wait' : 'pointer',
                                opacity: isFixing ? 0.6 : 1, whiteSpace: 'nowrap',
                              }}
                            >
                              {isFixing ? 'Reparando...' : 'Reparar'}
                            </button>
                          )}
                          {/* Fix result */}
                          {wasFixed && (
                            <span style={{ ...adminFonts.mono, fontSize: '10px', color: adminColors.green }}>
                              {'\u2705'} {wasFixed}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {/* Action buttons row */}
            {hasProblems && (
              <div style={{
                ...adminCard, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                {/* Re-run after fixes */}
                <button onClick={runHealthCheck} style={{
                  background: 'transparent', border: `1px solid ${adminColors.border}`,
                  color: adminColors.ivory, borderRadius: '8px', padding: '10px 18px',
                  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                }}>
                  Re-verificar
                </button>

                {/* Escalate to Claude */}
                {hasUnfixableProblems && (
                  <button onClick={escalateToClaudeCode} disabled={escalating} style={{
                    background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                    color: '#ef4444', borderRadius: '8px', padding: '10px 18px',
                    fontSize: '13px', fontWeight: 700, cursor: escalating ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}>
                    <span style={{ fontSize: '16px' }}>{'\uD83E\uDD16'}</span>
                    {escalating ? 'Generando reporte...' : 'Enviar a Claude'}
                  </button>
                )}
              </div>
            )}

            {/* Escalation result */}
            {escalateResult && (
              <div style={{
                ...adminCard,
                background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '20px' }}>{'\uD83E\uDD16'}</span>
                  <div>
                    <div style={{ ...adminFonts.body, fontWeight: 600, marginBottom: '4px' }}>Reporte generado</div>
                    <div style={{ ...adminFonts.body, fontSize: '13px', color: adminColors.gray }}>
                      {escalateResult}
                    </div>
                    <div style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.grayDim, marginTop: '6px' }}>
                      Abre una nueva sesion de Claude Code y pega el contenido del archivo descargado.
                      Claude va a diagnosticar y arreglar los problemas automaticamente.
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* All clear message */}
            {hcResult.summary.failed === 0 && hcResult.summary.warnings === 0 && (
              <div style={{
                ...adminCard, textAlign: 'center', padding: '24px',
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
              }}>
                <span style={{ fontSize: '32px', display: 'block', marginBottom: '8px' }}>{'\u2705'}</span>
                <span style={{ ...adminFonts.body, fontWeight: 700, color: adminColors.green }}>
                  Todo funciona perfectamente
                </span>
              </div>
            )}
          </div>
        )}

        {!hcResult && !hcLoading && (
          <div style={{ ...adminCard, textAlign: 'center', color: adminColors.gray, fontSize: '13px', padding: '32px' }}>
            Ejecuta los tests para verificar el estado completo de la app
          </div>
        )}
      </section>

      {/* Section: Service Health */}
      <section>
        <h2 style={sectionTitle}>Estado de Servicios</h2>
        <HealthGrid services={services} loading={loading} />
      </section>

      {/* Section: DB Stats + Environment (2 columns) */}
      <section style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
        gap: '24px',
      }}>
        {/* Left: DB Stats */}
        <div>
          <h2 style={sectionTitle}>Base de Datos</h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
            gap: '10px',
          }}>
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <AdminCard key={i} label="..." value="" loading />
              ))
            ) : (
              Object.entries(health?.tables ?? {}).map(([table, count]) => (
                <AdminCard
                  key={table}
                  label={table}
                  value={count}
                  style={{ padding: '14px' }}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Environment Variables */}
        <div>
          <h2 style={sectionTitle}>Variables de Entorno</h2>
          <div style={{ ...adminCard }}>
            {loading ? (
              <p style={{ ...adminFonts.mono }}>Cargando...</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {Object.entries(health?.env ?? {}).map(([key, present]) => (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0,
                      background: present ? adminColors.green : adminColors.red,
                      boxShadow: present ? `0 0 6px ${adminColors.green}` : 'none',
                    }} />
                    <span style={{ ...adminFonts.mono, color: adminColors.ivory, fontSize: '13px' }}>
                      {key}
                    </span>
                    {present ? (
                      <AdminBadge text="OK" variant="success" />
                    ) : (
                      <AdminBadge text="Falta" variant="error" />
                    )}
                    {envNotes[key] && (
                      <span style={{ ...adminFonts.mono, fontSize: '11px', color: adminColors.grayDim }}>
                        — {envNotes[key]}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Section: Deploy Info */}
      <section>
        <h2 style={sectionTitle}>Último Deploy</h2>
        <div style={{ ...adminCard, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ ...adminFonts.label, marginBottom: 0 }}>Commit</span>
          <span style={{
            ...adminFonts.mono,
            color: adminColors.ivory,
            background: adminColors.bgDeep,
            padding: '6px 14px',
            borderRadius: '6px',
            fontSize: '13px',
          }}>
            {loading ? '...' : health?.services.vercel.commit || 'local'}
          </span>
        </div>
      </section>

      {/* Section: Configuration */}
      <section>
        <h2 style={sectionTitle}>Configuración</h2>
        <div style={{ ...adminCard }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <ConfigRow label="Nombre" value="Golfers+" badge={<AdminBadge text="Producción" variant="gold" />} />
            <ConfigRow label="URL" value="golfersplus.vercel.app" />
            <ConfigRow label="Stack" value="Next.js 14 · Supabase · Tailwind · TypeScript · Vercel" />
            <ConfigRow label="Email soporte" value="soporte@golfers.plus" />
            <div style={{ borderTop: `1px solid ${adminColors.border}`, paddingTop: '12px', marginTop: '4px' }}>
              <span style={{ ...adminFonts.label, display: 'block', marginBottom: '8px' }}>tAIger Limits</span>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <AdminBadge text="3 sesiones gratis/mes" variant="gold" />
                <AdminBadge text="Admin via ADMIN_EMAILS" variant="neutral" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section: Debug Tools */}
      <section>
        <h2 style={sectionTitle}>Herramientas de Debug</h2>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <button
            onClick={handlePing}
            disabled={pingLoading}
            style={{
              ...adminFonts.body,
              background: pingLoading ? adminColors.border : adminColors.gold,
              color: pingLoading ? adminColors.gray : adminColors.bgDeep,
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: pingLoading ? 'wait' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: pingLoading ? 0.7 : 1,
            }}
          >
            {pingLoading ? 'Pinging...' : 'Ping Servicios'}
          </button>
          <button
            onClick={handleDebugAuth}
            disabled={debugLoading}
            style={{
              ...adminFonts.body,
              background: debugLoading ? adminColors.border : 'transparent',
              color: debugLoading ? adminColors.gray : adminColors.ivory,
              border: `1px solid ${adminColors.border}`,
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: debugLoading ? 'wait' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: debugLoading ? 0.7 : 1,
            }}
          >
            {debugLoading ? 'Cargando...' : 'Debug Auth'}
          </button>
        </div>

        {/* Results area */}
        {(lastPing || debugResult) && (
          <div style={{
            ...adminCard,
            background: adminColors.bgDeep,
            maxHeight: '300px',
            overflowY: 'auto',
          }}>
            {lastPing && (
              <p style={{ ...adminFonts.mono, color: adminColors.green, marginBottom: debugResult ? '12px' : 0 }}>
                {lastPing}
              </p>
            )}
            {debugResult && (
              <pre style={{
                ...adminFonts.mono,
                color: adminColors.ivory,
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                margin: 0,
              }}>
                {debugResult}
              </pre>
            )}
          </div>
        )}
      </section>

      {/* Section: Acciones de Emergencia */}
      <section>
        <h2 style={sectionTitle}>Acciones de Emergencia</h2>
        <div style={{ ...adminCard }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <button
                onClick={handleForceClose}
                disabled={forceCloseLoading}
                style={{
                  ...adminFonts.body,
                  background: forceCloseLoading ? adminColors.border : adminColors.yellow,
                  color: forceCloseLoading ? adminColors.gray : adminColors.bgDeep,
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontWeight: 600,
                  fontSize: '13px',
                  cursor: forceCloseLoading ? 'wait' : 'pointer',
                  transition: 'opacity 0.2s',
                  opacity: forceCloseLoading ? 0.7 : 1,
                }}
              >
                {forceCloseLoading ? 'Procesando...' : 'Forzar cierre de rondas abandonadas (>24h)'}
              </button>
              {forceCloseResult && (
                forceCloseResult.count > 0 ? (
                  <AdminBadge text={`${forceCloseResult.count} rondas cerradas`} variant="success" />
                ) : forceCloseResult.count === 0 ? (
                  <AdminBadge text="Sin rondas abandonadas" variant="neutral" />
                ) : (
                  <AdminBadge text="Error al ejecutar" variant="error" />
                )
              )}
            </div>

            {/* Recent Admin Actions */}
            <div style={{ borderTop: `1px solid ${adminColors.border}`, paddingTop: '16px' }}>
              <span style={{ ...adminFonts.label, display: 'block', marginBottom: '8px' }}>Acciones recientes</span>
              <p style={{ ...adminFonts.mono, fontSize: '12px', margin: 0 }}>
                Las acciones se registran en analytics_events. Usa la SQL Console para consultarlas.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section: SQL Console */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <h2 style={{ ...sectionTitle, marginBottom: 0 }}>SQL Console</h2>
          <AdminBadge text="SOLO LECTURA RECOMENDADO" variant="warning" />
        </div>
        <div style={{ ...adminCard }}>
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            rows={6}
            placeholder="SELECT * FROM profiles LIMIT 10"
            style={{
              width: '100%',
              fontFamily: "'DM Mono', monospace",
              fontSize: '13px',
              background: adminColors.bg,
              border: `1px solid ${adminColors.border}`,
              borderRadius: '8px',
              color: adminColors.ivory,
              padding: '12px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
              marginBottom: '12px',
            }}
          />
          <button
            onClick={handleSqlExecute}
            disabled={sqlLoading || !sqlQuery.trim()}
            style={{
              ...adminFonts.body,
              background: (sqlLoading || !sqlQuery.trim()) ? adminColors.border : adminColors.gold,
              color: (sqlLoading || !sqlQuery.trim()) ? adminColors.gray : adminColors.bgDeep,
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: (sqlLoading || !sqlQuery.trim()) ? 'wait' : 'pointer',
              transition: 'opacity 0.2s',
              opacity: (sqlLoading || !sqlQuery.trim()) ? 0.7 : 1,
              marginBottom: '16px',
            }}
          >
            {sqlLoading ? 'Ejecutando...' : 'Ejecutar'}
          </button>

          {/* SQL Error */}
          {sqlError && (
            <div style={{
              ...adminFonts.mono,
              color: adminColors.red,
              background: adminColors.redDim,
              padding: '12px',
              borderRadius: '8px',
              fontSize: '12px',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
            }}>
              {sqlError}
            </div>
          )}

          {/* SQL Results */}
          {sqlResult !== null && !sqlError && (
            sqlResult.length === 0 ? (
              <p style={{ ...adminFonts.mono, margin: 0 }}>Sin resultados</p>
            ) : (
              <div style={{
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: '400px',
                background: adminColors.bg,
                border: `1px solid ${adminColors.border}`,
                borderRadius: '8px',
              }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '11px',
                  color: adminColors.ivory,
                }}>
                  <thead>
                    <tr>
                      {Object.keys(sqlResult[0]).map((col) => (
                        <th key={col} style={{
                          textAlign: 'left',
                          padding: '8px 10px',
                          borderBottom: `1px solid ${adminColors.border}`,
                          color: adminColors.gold,
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          position: 'sticky',
                          top: 0,
                          background: adminColors.bgDeep,
                        }}>
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sqlResult.map((row, i) => (
                      <tr key={i} style={{
                        background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)',
                      }}>
                        {Object.values(row).map((val, j) => (
                          <td key={j} style={{
                            padding: '6px 10px',
                            borderBottom: `1px solid ${adminColors.border}`,
                            whiteSpace: 'nowrap',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {val === null ? <span style={{ color: adminColors.grayDim }}>NULL</span> : String(val)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  )
}

function ConfigRow({ label, value, badge }: { label: string; value: string; badge?: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 0',
      borderBottom: `1px solid ${adminColors.border}`,
    }}>
      <span style={{ ...adminFonts.label, marginBottom: 0 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ ...adminFonts.body, fontSize: '13px' }}>{value}</span>
        {badge}
      </div>
    </div>
  )
}
