'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'
import { DollarSign, Users, Target, BarChart3 } from '@/components/icons'

interface CostSummary {
  periodDays: number
  planPriceUsd: number
  prodCostUsd: number
  devCostUsd: number
  totalCalls: number
  activeUsers: number
  costPerActiveUser: number
  marginPerUser: number
  coachCostUsd: number
  coachConversations: number
  costPerCoachConversation: number
  coachCacheHitPct: number
  bySurface: { surface: string; costUsd: number; calls: number }[]
  byModel: { model: string; costUsd: number; calls: number }[]
  byDay: { day: string; costUsd: number; calls: number }[]
  topUsers: { userId: string; costUsd: number; calls: number }[]
}

/** Costos chicos: 4 decimales bajo $1, 2 decimales arriba. */
function usd(n: number): string {
  if (!Number.isFinite(n)) return '$0'
  const abs = Math.abs(n)
  return abs > 0 && abs < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`
}
function pct(n: number): string {
  return `${(n * 100).toFixed(0)}%`
}

const SURFACE_LABEL: Record<string, string> = {
  coach_chat: 'Coach (chat)',
  import_insight: 'Import (insight)',
  import_vision: 'Import (visión)',
  rag_search: 'RAG reglas',
  tournament_assistant: 'Asistente torneos',
  eval: 'Eval / banco',
  other: 'Otro',
}

const DAY_OPTIONS = [7, 30, 90]

export default function CostosPage() {
  const [data, setData] = useState<CostSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)
  const [plan, setPlan] = useState(5)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/costos?days=${days}&plan=${plan}`)
      if (res.ok) setData(await res.json())
    } catch {
      /* silent */
    } finally {
      setLoading(false)
    }
  }, [days, plan])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const marginPositive = (data?.marginPerUser ?? 0) >= 0
  const maxDayCost = Math.max(1e-9, ...(data?.byDay ?? []).map((d) => d.costUsd))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
      {/* Controles */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              style={{
                background: d === days ? adminColors.gold : adminColors.card,
                color: d === days ? adminColors.bgDeep : adminColors.gray,
                border: `1px solid ${d === days ? adminColors.gold : adminColors.border}`,
                borderRadius: '8px', padding: '7px 14px', cursor: 'pointer',
                fontSize: '12px', fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {d}d
            </button>
          ))}
          <label style={{ ...adminFonts.label, marginLeft: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            Plan $/mes
            <input
              type="number"
              min={0}
              step={1}
              value={plan}
              onChange={(e) => setPlan(Math.max(0, Number(e.target.value)))}
              style={{
                width: '72px', background: adminColors.card, color: adminColors.ivory,
                border: `1px solid ${adminColors.border}`, borderRadius: '8px',
                padding: '6px 10px', fontSize: '13px', fontFamily: "'DM Mono', monospace",
              }}
            />
          </label>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          style={{
            background: adminColors.card, border: `1px solid ${adminColors.border}`,
            borderRadius: '8px', padding: '8px 16px', color: adminColors.gold,
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '13px',
            fontFamily: "'DM Sans', sans-serif", fontWeight: 600, opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* KPIs — la pregunta de rentabilidad */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>¿Hay margen? (últimos {days}d)</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
          <AdminCard icon={<Users size={20} />} label="Costo IA / usuario activo" value={usd(data?.costPerActiveUser ?? 0)} loading={loading}>
            <span style={{ ...adminFonts.label, textTransform: 'none', fontSize: '11px' }}>
              {data?.activeUsers ?? 0} usuarios · prod {usd(data?.prodCostUsd ?? 0)}
            </span>
          </AdminCard>

          <AdminCard
            icon={<DollarSign size={20} />}
            label={`Margen / usuario (plan $${data?.planPriceUsd ?? plan})`}
            value={usd(data?.marginPerUser ?? 0)}
            loading={loading}
            style={{ borderColor: marginPositive ? adminColors.green : adminColors.red }}
          >
            <span style={{ ...adminFonts.label, textTransform: 'none', fontSize: '11px', color: marginPositive ? adminColors.green : adminColors.red, fontWeight: 600 }}>
              {marginPositive ? 'Rentable' : 'En pérdida'} por usuario
            </span>
          </AdminCard>

          <AdminCard icon={<Target size={20} />} label="Costo / conversación coach" value={usd(data?.costPerCoachConversation ?? 0)} loading={loading}>
            <span style={{ ...adminFonts.label, textTransform: 'none', fontSize: '11px' }}>
              {data?.coachConversations ?? 0} conversaciones · {usd(data?.coachCostUsd ?? 0)}
            </span>
          </AdminCard>

          <AdminCard icon={<BarChart3 size={20} />} label="Input del coach por caché" value={pct(data?.coachCacheHitPct ?? 0)} loading={loading}>
            <span style={{ ...adminFonts.label, textTransform: 'none', fontSize: '11px' }}>
              cuánto más alto, más barato el coach
            </span>
          </AdminCard>
        </div>
      </section>

      {/* prod vs dev */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '16px' }}>Prod vs Dev/Eval</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
          <AdminCard label="Costo prod (real)" value={usd(data?.prodCostUsd ?? 0)} loading={loading} />
          <AdminCard label="Costo dev/eval (testing)" value={usd(data?.devCostUsd ?? 0)} loading={loading} />
          <AdminCard label="Llamadas totales" value={data?.totalCalls ?? 0} loading={loading} />
        </div>
      </section>

      {/* Desglose por surface + modelo */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
        <div>
          <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '12px' }}>Por feature (prod)</h2>
          <AdminTable
            loading={loading}
            data={(data?.bySurface ?? []).map((s) => ({
              feature: SURFACE_LABEL[s.surface] ?? s.surface,
              costo: usd(s.costUsd),
              llamadas: s.calls,
            }))}
            columns={[
              { key: 'feature', label: 'Feature' },
              { key: 'costo', label: 'Costo', width: '110px' },
              { key: 'llamadas', label: 'Llamadas', width: '90px' },
            ]}
            pageSize={10}
          />
        </div>
        <div>
          <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '12px' }}>Por modelo (prod)</h2>
          <AdminTable
            loading={loading}
            data={(data?.byModel ?? []).map((m) => ({
              modelo: m.model,
              costo: usd(m.costUsd),
              llamadas: m.calls,
            }))}
            columns={[
              { key: 'modelo', label: 'Modelo' },
              { key: 'costo', label: 'Costo', width: '110px' },
              { key: 'llamadas', label: 'Llamadas', width: '90px' },
            ]}
            pageSize={10}
          />
        </div>
      </section>

      {/* Tendencia por día */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '12px' }}>Costo prod por día</h2>
        <div style={{ ...adminCard }}>
          {loading ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: adminColors.grayDim, fontSize: '13px' }}>Cargando...</div>
          ) : (data?.byDay.length ?? 0) === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: adminColors.grayDim, fontSize: '13px' }}>Sin datos en el período.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data?.byDay.map((d) => (
                <div key={d.day} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ ...adminFonts.mono, fontSize: '11px', width: '78px', color: adminColors.grayDim }}>{d.day.slice(5)}</span>
                  <div style={{ flex: 1, background: adminColors.border, borderRadius: '4px', height: '14px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, (d.costUsd / maxDayCost) * 100)}%`, height: '100%', background: adminColors.gold, borderRadius: '4px' }} />
                  </div>
                  <span style={{ ...adminFonts.mono, fontSize: '11px', width: '78px', textAlign: 'right' }}>{usd(d.costUsd)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Top usuarios por costo */}
      <section>
        <h2 style={{ ...adminFonts.sectionTitle, marginBottom: '12px' }}>Top usuarios por costo (prod)</h2>
        <AdminTable
          loading={loading}
          data={(data?.topUsers ?? []).map((u, i) => ({
            rank: i + 1,
            usuario: u.userId,
            costo: usd(u.costUsd),
            llamadas: u.calls,
          }))}
          columns={[
            { key: 'rank', label: '#', width: '48px' },
            { key: 'usuario', label: 'User ID' },
            { key: 'costo', label: 'Costo', width: '110px' },
            { key: 'llamadas', label: 'Llamadas', width: '90px' },
          ]}
          searchKeys={['usuario']}
          searchPlaceholder="Buscar user id…"
          pageSize={20}
        />
      </section>
    </div>
  )
}
