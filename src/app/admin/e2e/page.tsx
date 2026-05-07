'use client'

import { useCallback, useEffect, useState } from 'react'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface RunSummary {
  id: string
  status: 'queued' | 'running' | 'passed' | 'failed' | 'error'
  github_run_url: string | null
  branch: string | null
  commit_sha: string | null
  base_url: string | null
  started_at: string | null
  finished_at: string | null
  summary: { total: number; passed: number; failed: number; skipped: number }
  error_message: string | null
  created_at: string
}

interface TestResult {
  name: string
  status: 'passed' | 'failed' | 'skipped' | 'timedOut' | 'interrupted'
  duration_ms?: number
  error?: string
  file?: string
}

interface RunDetail extends RunSummary {
  results: TestResult[]
  triggered_by: string | null
  github_run_id: number | null
}

const statusStyles: Record<RunSummary['status'], { bg: string; fg: string; label: string }> = {
  queued: { bg: adminColors.grayDim, fg: adminColors.gray, label: 'En cola' },
  running: { bg: adminColors.blueDim, fg: adminColors.blue, label: 'Corriendo' },
  passed: { bg: adminColors.greenDim, fg: adminColors.green, label: 'Pasó' },
  failed: { bg: adminColors.redDim, fg: adminColors.red, label: 'Falló' },
  error: { bg: adminColors.redDim, fg: adminColors.red, label: 'Error' },
}

function formatDuration(ms?: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatRelative(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (diff < 60_000) return 'hace segundos'
  if (diff < 3600_000) return `hace ${Math.floor(diff / 60_000)}m`
  if (diff < 86400_000) return `hace ${Math.floor(diff / 3600_000)}h`
  return date.toLocaleDateString('es-CL')
}

function StatusPill({ status }: { status: RunSummary['status'] }) {
  const s = statusStyles[status]
  return (
    <span style={{
      display: 'inline-block',
      padding: '4px 10px',
      borderRadius: 999,
      fontSize: 12,
      fontWeight: 600,
      background: s.bg,
      color: s.fg,
    }}>{s.label}</span>
  )
}

export default function E2EAdminPage() {
  const [runs, setRuns] = useState<RunSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<RunDetail | null>(null)

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/e2e/runs', { credentials: 'include' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? `HTTP ${res.status}`)
        return
      }
      const d = await res.json()
      setRuns(d.runs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  // Polling: si hay runs activos, refrescar cada 5s para ver progreso.
  useEffect(() => {
    const hasActive = runs.some(r => r.status === 'queued' || r.status === 'running')
    if (!hasActive) return
    const t = setInterval(loadRuns, 5000)
    return () => clearInterval(t)
  }, [runs, loadRuns])

  const handleTrigger = async () => {
    setTriggering(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/e2e/runs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? `HTTP ${res.status}`)
      } else {
        await loadRuns()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setTriggering(false)
    }
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setDetail(null)
      return
    }
    setExpandedId(id)
    setDetail(null)
    try {
      const res = await fetch(`/api/admin/e2e/runs/${id}`, { credentials: 'include' })
      if (res.ok) {
        const d = await res.json()
        setDetail(d.run)
      }
    } catch {
      // silencioso — el panel sigue funcionando con la summary
    }
  }

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 32, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ ...adminFonts.kpi, fontSize: '2rem', marginBottom: 6 }}>Tests E2E</h1>
          <p style={{ color: adminColors.gray, fontSize: 14, margin: 0 }}>
            Robots que prueban la app como un usuario real. Apretá &quot;Probar ahora&quot;
            para correr los 7 tests contra producción.
          </p>
        </div>
        <button
          onClick={handleTrigger}
          disabled={triggering}
          style={{
            background: triggering ? adminColors.goldDim : adminColors.gold,
            color: '#050b14',
            border: 'none',
            padding: '12px 24px',
            borderRadius: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: triggering ? 'wait' : 'pointer',
            minHeight: 44,
            opacity: triggering ? 0.6 : 1,
          }}
        >
          {triggering ? 'Disparando…' : 'Probar ahora'}
        </button>
      </div>

      {error && (
        <div style={{
          background: adminColors.redDim,
          border: `1px solid ${adminColors.red}`,
          color: adminColors.red,
          borderRadius: 8,
          padding: 14,
          marginBottom: 24,
          fontSize: 14,
        }}>{error}</div>
      )}

      <div style={adminCard}>
        {loading ? (
          <p style={{ color: adminColors.gray, padding: 24, textAlign: 'center' }}>Cargando…</p>
        ) : runs.length === 0 ? (
          <p style={{ color: adminColors.gray, padding: 24, textAlign: 'center' }}>
            Todavía no hay corridas. Apretá &quot;Probar ahora&quot; para crear la primera.
          </p>
        ) : (
          <div>
            {runs.map((run, i) => {
              const isExpanded = expandedId === run.id
              const isLast = i === runs.length - 1
              return (
                <div key={run.id}>
                  <div
                    onClick={() => handleExpand(run.id)}
                    style={{
                      padding: '16px 20px',
                      borderBottom: !isLast || isExpanded ? `1px solid ${adminColors.border}` : 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                      flexWrap: 'wrap',
                    }}
                  >
                    <StatusPill status={run.status} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ color: adminColors.ivory, fontSize: 14, fontWeight: 600 }}>
                        {run.summary.total > 0
                          ? `${run.summary.passed}/${run.summary.total} pasaron · ${run.summary.failed} fallaron · ${run.summary.skipped} skipeados`
                          : run.status === 'queued' ? 'Esperando que arranque GitHub…'
                          : run.status === 'running' ? 'Corriendo en GitHub Actions…'
                          : 'Sin resultados'}
                      </div>
                      <div style={{ color: adminColors.gray, fontSize: 12, marginTop: 4 }}>
                        {formatRelative(run.created_at)} · {run.branch ?? 'main'}
                        {run.commit_sha && ` · ${run.commit_sha.slice(0, 7)}`}
                      </div>
                    </div>
                    {run.github_run_url && (
                      <a
                        href={run.github_run_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => e.stopPropagation()}
                        style={{ color: adminColors.gold, fontSize: 12, textDecoration: 'none' }}
                      >Ver en GitHub →</a>
                    )}
                  </div>

                  {isExpanded && (
                    <div style={{
                      padding: '16px 20px 24px',
                      background: adminColors.bgDeep,
                      borderBottom: !isLast ? `1px solid ${adminColors.border}` : 'none',
                    }}>
                      {!detail ? (
                        <p style={{ color: adminColors.gray, fontSize: 13 }}>Cargando detalle…</p>
                      ) : (
                        <RunDetailView run={detail} />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function RunDetailView({ run }: { run: RunDetail }) {
  if (run.error_message) {
    return (
      <div>
        <div style={{ color: adminColors.red, fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Error de la corrida</div>
        <pre style={{
          color: adminColors.gray,
          fontSize: 12,
          fontFamily: "'DM Mono', monospace",
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          margin: 0,
        }}>{run.error_message}</pre>
      </div>
    )
  }
  if (!run.results || run.results.length === 0) {
    return <p style={{ color: adminColors.gray, fontSize: 13 }}>Todavía no hay resultados de tests individuales.</p>
  }
  const failed = run.results.filter(r => r.status === 'failed' || r.status === 'timedOut' || r.status === 'interrupted')
  const passed = run.results.filter(r => r.status === 'passed')
  const skipped = run.results.filter(r => r.status === 'skipped')

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {failed.length > 0 && (
        <div>
          <div style={{ color: adminColors.red, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Tests que fallaron ({failed.length})
          </div>
          {failed.map((t, i) => (
            <div key={i} style={{
              background: adminColors.redDim,
              border: `1px solid ${adminColors.red}`,
              borderRadius: 6,
              padding: 12,
              marginBottom: 8,
            }}>
              <div style={{ color: adminColors.ivory, fontSize: 13, fontWeight: 600 }}>{t.name}</div>
              {t.file && <div style={{ color: adminColors.gray, fontSize: 11, marginTop: 2 }}>{t.file}</div>}
              {t.error && (
                <pre style={{
                  color: adminColors.gray,
                  fontSize: 11,
                  fontFamily: "'DM Mono', monospace",
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  marginTop: 8,
                  marginBottom: 0,
                }}>{t.error.slice(0, 1000)}</pre>
              )}
            </div>
          ))}
        </div>
      )}
      {passed.length > 0 && (
        <div>
          <div style={{ color: adminColors.green, fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Tests que pasaron ({passed.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {passed.map((t, i) => (
              <span key={i} style={{
                background: adminColors.greenDim,
                color: adminColors.green,
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 4,
              }}>{t.name} ({formatDuration(t.duration_ms)})</span>
            ))}
          </div>
        </div>
      )}
      {skipped.length > 0 && (
        <div style={{ color: adminColors.gray, fontSize: 12 }}>
          {skipped.length} test{skipped.length === 1 ? '' : 's'} skipeado{skipped.length === 1 ? '' : 's'}
        </div>
      )}
    </div>
  )
}
