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

export default function SistemaPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [pingLoading, setPingLoading] = useState(false)
  const [debugLoading, setDebugLoading] = useState(false)
  const [debugResult, setDebugResult] = useState<string | null>(null)
  const [lastPing, setLastPing] = useState<string | null>(null)

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
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
            <ConfigRow label="URL" value="tu-golf.vercel.app" />
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
