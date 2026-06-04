'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { adminColors, adminCard, adminFonts } from '@/components/admin/admin-tokens'

interface UserRow {
  id: string
  name: string
  email: string
  role: string
  indice: number | null
  indice_golfers: number | null
  nivel: number | null
  cpi_score: number | null
  cpi_status: string | null
  created_at: string
  // Aggregated counts
  rounds_count?: number
  tournaments_count?: number
  taiger_count?: number
  rondas_count?: number
}

const NIVEL_LABELS: Record<number, string> = {
  1: 'Rookie',
  2: 'En Cancha',
  3: 'Activo',
  4: 'Scratch+',
  5: 'Golfer+',
}

export default function UsuariosPage() {
  const router = useRouter()
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'created_at' | 'name' | 'indice_golfers' | 'nivel'>('created_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()

      // Lista de usuarios vía API admin (service role): el email de profiles ya
      // no es legible por el cliente público (RLS column-level).
      const usersRes = await fetch('/api/admin/users?limit=500')
      const usersJson = usersRes.ok ? await usersRes.json() : { users: [], total: 0 }
      const profiles = (usersJson.users as UserRow[]) || []
      const count = usersJson.total as number

      if (!profiles.length) { setLoading(false); return }
      setTotalCount(count ?? profiles.length)

      // Batch: count rounds per user
      const userIds = profiles.map(p => p.id)

      const [roundsRes, tourneysRes, taigerRes, rondasRes] = await Promise.all([
        supabase.from('historical_rounds').select('user_id', { count: 'exact', head: false }).in('user_id', userIds),
        supabase.from('players').select('user_id', { count: 'exact', head: false }).in('user_id', userIds),
        supabase.from('taiger_sessions').select('user_id', { count: 'exact', head: false }).in('user_id', userIds),
        supabase.from('ronda_libre_jugadores').select('user_id', { count: 'exact', head: false }).in('user_id', userIds),
      ])

      // Count per user
      const countMap = (data: { user_id: string }[] | null) => {
        const map: Record<string, number> = {}
        ;(data || []).forEach(r => { map[r.user_id] = (map[r.user_id] || 0) + 1 })
        return map
      }

      const roundsMap = countMap(roundsRes.data as { user_id: string }[] | null)
      const tourneysMap = countMap(tourneysRes.data as { user_id: string }[] | null)
      const taigerMap = countMap(taigerRes.data as { user_id: string }[] | null)
      const rondasMap = countMap(rondasRes.data as { user_id: string }[] | null)

      const enriched: UserRow[] = profiles.map(p => ({
        ...p,
        rounds_count: roundsMap[p.id] || 0,
        tournaments_count: tourneysMap[p.id] || 0,
        taiger_count: taigerMap[p.id] || 0,
        rondas_count: rondasMap[p.id] || 0,
      }))

      setUsers(enriched)
      setLoading(false)
    }
    load()
  }, [])

  const filtered = users.filter(u => {
    if (!search) return true
    const q = search.toLowerCase()
    return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
  })

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0
    if (sortBy === 'created_at') cmp = (a.created_at || '').localeCompare(b.created_at || '')
    else if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
    else if (sortBy === 'indice_golfers') cmp = (a.indice_golfers ?? 999) - (b.indice_golfers ?? 999)
    else if (sortBy === 'nivel') cmp = (a.nivel ?? 0) - (b.nivel ?? 0)
    return sortAsc ? cmp : -cmp
  })

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(!sortAsc)
    else { setSortBy(col); setSortAsc(false) }
  }

  const sortArrow = (col: typeof sortBy) => sortBy === col ? (sortAsc ? ' ↑' : ' ↓') : ''

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', color: adminColors.gray }}>
        Cargando usuarios...
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
        <div>
          <h1 style={{ ...adminFonts.sectionTitle, fontSize: '24px', margin: 0 }}>Usuarios registrados</h1>
          <p style={{ ...adminFonts.mono, margin: '4px 0 0' }}>{totalCount} usuarios totales · {filtered.length} mostrados</p>
        </div>
        <input
          type="text"
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            background: adminColors.card,
            border: `1px solid ${adminColors.border}`,
            borderRadius: '8px',
            padding: '10px 16px',
            color: adminColors.ivory,
            fontSize: '14px',
            outline: 'none',
            width: '280px',
            maxWidth: '100%',
          }}
        />
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {[
          { label: 'Total', value: totalCount },
          { label: 'Con indice G+', value: users.filter(u => u.indice_golfers != null).length },
          { label: 'Con CPI', value: users.filter(u => u.cpi_score != null && u.cpi_score > 0).length },
          { label: 'Usaron tAIger', value: users.filter(u => (u.taiger_count ?? 0) > 0).length },
          { label: 'Jugaron torneo', value: users.filter(u => (u.tournaments_count ?? 0) > 0).length },
        ].map(kpi => (
          <div key={kpi.label} style={{ ...adminCard, padding: '16px', textAlign: 'center' }}>
            <div style={{ ...adminFonts.kpiSmall, fontSize: '1.3rem' }}>{kpi.value}</div>
            <div style={{ ...adminFonts.label, marginTop: '4px' }}>{kpi.label}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div style={{ ...adminCard, padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminColors.border}` }}>
                {[
                  { key: 'name' as const, label: 'Nombre' },
                  { key: 'created_at' as const, label: 'Registro' },
                  { key: 'indice_golfers' as const, label: 'Indice G+' },
                  { key: 'nivel' as const, label: 'Nivel' },
                ].map(col => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{
                      ...adminFonts.label,
                      padding: '12px 16px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      userSelect: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {col.label}{sortArrow(col.key)}
                  </th>
                ))}
                <th style={{ ...adminFonts.label, padding: '12px 16px', textAlign: 'center' }}>CPI</th>
                <th style={{ ...adminFonts.label, padding: '12px 16px', textAlign: 'center' }}>Rondas</th>
                <th style={{ ...adminFonts.label, padding: '12px 16px', textAlign: 'center' }}>Torneos</th>
                <th style={{ ...adminFonts.label, padding: '12px 16px', textAlign: 'center' }}>tAIger</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(u => (
                <tr
                  key={u.id}
                  onClick={() => router.push(`/admin/usuarios/${u.id}`)}
                  style={{
                    borderBottom: `1px solid ${adminColors.border}`,
                    cursor: 'pointer',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = adminColors.cardHover)}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '32px', height: '32px', borderRadius: '50%',
                        background: adminColors.goldDim, color: adminColors.gold,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: 700, flexShrink: 0,
                      }}>
                        {(u.name || '?')[0]?.toUpperCase()}
                      </div>
                      <div>
                        <div style={{ ...adminFonts.body, fontWeight: 500 }}>{u.name || '—'}</div>
                        <div style={{ ...adminFonts.mono, fontSize: '11px' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '14px 16px', ...adminFonts.mono }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', ...adminFonts.body, color: u.indice_golfers != null ? adminColors.gold : adminColors.grayDim, fontWeight: u.indice_golfers != null ? 600 : 400 }}>
                    {u.indice_golfers != null ? u.indice_golfers.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {u.nivel ? (
                      <span style={{
                        background: adminColors.goldDim,
                        color: adminColors.gold,
                        border: `1px solid rgba(196,153,42,0.3)`,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 600,
                      }}>
                        {NIVEL_LABELS[u.nivel] || `Lv${u.nivel}`}
                      </span>
                    ) : (
                      <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', ...adminFonts.body }}>
                    {u.cpi_score != null && u.cpi_score > 0 ? u.cpi_score.toFixed(1) : '—'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', ...adminFonts.body }}>
                    {(u.rounds_count ?? 0) + (u.rondas_count ?? 0) || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', ...adminFonts.body }}>
                    {u.tournaments_count || '—'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center', ...adminFonts.body }}>
                    {u.taiger_count || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
