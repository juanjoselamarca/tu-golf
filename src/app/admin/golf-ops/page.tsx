'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

interface GolfOpsData {
  tournaments: {
    total: number
    list: { id: string; name: string; slug: string; status: string; created_at: string; hole_count: number }[]
  }
  rondasLibres: { total: number; enCurso: number; finalizadas: number }
  scoring: { totalRounds: number; totalHoleScores: number }
  taiger: {
    totalSessions: number
    sessionTypes: Record<string, number>
    recentSessions: { id: string; session_type: string; created_at: string; user_id: string }[]
    patternDistribution: Record<string, number>
  }
  courses: { total: number; list: { id: string; nombre: string; ciudad: string; pais: string }[] }
}

interface UsersData {
  users: { id: string; name: string; email: string; indice: number | null; created_at: string; role: string }[]
  total: number
  page: number
  limit: number
  totalPages: number
}

type Tab = 'torneos' | 'rondas' | 'usuarios' | 'taiger'

const tabs: { key: Tab; label: string }[] = [
  { key: 'torneos', label: 'Torneos' },
  { key: 'rondas', label: 'Rondas' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'taiger', label: 'tAIger' },
]

export default function GolfOpsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('torneos')
  const [ops, setOps] = useState<GolfOpsData | null>(null)
  const [users, setUsers] = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)

  const fetchOps = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/golf-ops')
      if (res.ok) setOps(await res.json())
    } catch { /* silent */ } finally { setLoading(false) }
  }, [])

  const fetchUsers = useCallback(async (search: string, page: number) => {
    setUsersLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), limit: '15', search })
      const res = await fetch(`/api/admin/users?${params}`)
      if (res.ok) setUsers(await res.json())
    } catch { /* silent */ } finally { setUsersLoading(false) }
  }, [])

  useEffect(() => { fetchOps() }, [fetchOps])

  useEffect(() => {
    if (activeTab === 'usuarios') fetchUsers(userSearch, userPage)
  }, [activeTab, userSearch, userPage, fetchUsers])

  const statusVariant = (s: string) => {
    if (s === 'active' || s === 'en_curso') return 'success' as const
    if (s === 'finished' || s === 'finalizada') return 'neutral' as const
    if (s === 'draft') return 'warning' as const
    return 'neutral' as const
  }

  const tournamentRows = (ops?.tournaments.list ?? []).map(t => ({
    name: t.name,
    status: t.status,
    holes: t.hole_count,
    date: t.created_at?.split('T')[0] ?? '-',
  }))

  const userRows = (users?.users ?? []).map(u => ({
    name: u.name || '-',
    email: u.email || '-',
    hcp: u.indice != null ? String(u.indice) : '-',
    registro: u.created_at?.split('T')[0] ?? '-',
    role: u.role || 'user',
  }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '4px', background: adminColors.bg, borderRadius: '10px', padding: '4px' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              flex: 1, padding: '10px 16px', border: 'none', borderRadius: '8px', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: '13px', fontWeight: 600,
              background: activeTab === t.key ? adminColors.card : 'transparent',
              color: activeTab === t.key ? adminColors.gold : adminColors.gray,
              transition: 'all 0.2s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Torneos */}
      {activeTab === 'torneos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <AdminCard icon="🏆" label="Total Torneos" value={ops?.tournaments.total ?? 0} loading={loading} />
          </div>
          <AdminTable<{ name: string; status: string; holes: number; date: string }>
            columns={[
              { key: 'name', label: 'Nombre' },
              {
                key: 'status', label: 'Status', width: '120px',
                render: (row) => <AdminBadge text={row.status} variant={statusVariant(row.status)} dot />,
              },
              { key: 'holes', label: 'Hoyos', width: '80px' },
              { key: 'date', label: 'Fecha', width: '120px' },
            ]}
            data={tournamentRows}
            loading={loading}
          />
        </>
      )}

      {/* Rondas */}
      {activeTab === 'rondas' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <AdminCard icon="⛳" label="Total Rondas Libres" value={ops?.rondasLibres.total ?? 0} loading={loading} />
          <AdminCard icon="🟢" label="En Curso" value={ops?.rondasLibres.enCurso ?? 0} loading={loading} />
          <AdminCard icon="✅" label="Finalizadas" value={ops?.rondasLibres.finalizadas ?? 0} loading={loading} />
          <AdminCard icon="📝" label="Total Scores" value={ops?.scoring.totalHoleScores ?? 0} loading={loading} />
          <AdminCard icon="🔄" label="Total Rounds" value={ops?.scoring.totalRounds ?? 0} loading={loading} />
          <AdminCard icon="🎯" label="Total Hole Scores" value={ops?.scoring.totalHoleScores ?? 0} loading={loading} />
        </div>
      )}

      {/* Usuarios */}
      {activeTab === 'usuarios' && (
        <>
          <div style={{ ...adminCard }}>
            <input
              type="text"
              placeholder="Buscar por nombre o email..."
              value={userSearch}
              onChange={e => { setUserSearch(e.target.value); setUserPage(1) }}
              style={{
                background: adminColors.bg, border: `1px solid ${adminColors.border}`,
                borderRadius: '8px', padding: '8px 14px', color: adminColors.ivory,
                fontSize: '13px', outline: 'none', width: '100%', maxWidth: '360px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            />
          </div>
          <AdminTable<{ name: string; email: string; hcp: string; registro: string; role: string }>
            columns={[
              { key: 'name', label: 'Nombre' },
              { key: 'email', label: 'Email' },
              { key: 'hcp', label: 'HCP', width: '80px' },
              { key: 'registro', label: 'Registro', width: '120px' },
              {
                key: 'role', label: 'Role', width: '100px',
                render: (row) => (
                  <AdminBadge
                    text={row.role}
                    variant={row.role === 'admin' ? 'gold' : 'neutral'}
                  />
                ),
              },
            ]}
            data={userRows}
            loading={usersLoading}
            pageSize={15}
          />
          {/* Server-side pagination */}
          {users && users.totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px' }}>
              <button
                disabled={userPage <= 1}
                onClick={() => setUserPage(p => p - 1)}
                style={{
                  background: adminColors.bg, border: `1px solid ${adminColors.border}`,
                  borderRadius: '6px', padding: '6px 14px',
                  color: userPage <= 1 ? adminColors.grayDim : adminColors.ivory,
                  cursor: userPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >
                {'\u2190'}
              </button>
              <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{userPage} / {users.totalPages}</span>
              <button
                disabled={userPage >= users.totalPages}
                onClick={() => setUserPage(p => p + 1)}
                style={{
                  background: adminColors.bg, border: `1px solid ${adminColors.border}`,
                  borderRadius: '6px', padding: '6px 14px',
                  color: userPage >= users.totalPages ? adminColors.grayDim : adminColors.ivory,
                  cursor: userPage >= users.totalPages ? 'not-allowed' : 'pointer', fontSize: '12px',
                }}
              >
                {'\u2192'}
              </button>
            </div>
          )}
        </>
      )}

      {/* tAIger */}
      {activeTab === 'taiger' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            <AdminCard icon="🤖" label="Total Sessions" value={ops?.taiger.totalSessions ?? 0} loading={loading} />
          </div>

          {/* Session type distribution */}
          <div style={{ ...adminCard }}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>SESSION TYPES</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(ops?.taiger.sessionTypes ?? {}).map(([type, count]) => (
                <AdminBadge key={type} text={`${type}: ${count}`} variant="gold" />
              ))}
              {Object.keys(ops?.taiger.sessionTypes ?? {}).length === 0 && !loading && (
                <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin sesiones</span>
              )}
            </div>
          </div>

          {/* Pattern distribution */}
          <div style={{ ...adminCard }}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '12px' }}>PATTERN DISTRIBUTION</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {Object.entries(ops?.taiger.patternDistribution ?? {}).map(([type, count]) => (
                <AdminBadge key={type} text={`${type}: ${count}`} variant="neutral" />
              ))}
              {Object.keys(ops?.taiger.patternDistribution ?? {}).length === 0 && !loading && (
                <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin patrones</span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
