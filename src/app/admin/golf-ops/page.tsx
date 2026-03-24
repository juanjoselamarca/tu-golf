'use client'

import { useEffect, useState, useCallback } from 'react'
import { AdminCard } from '@/components/admin/AdminCard'
import { AdminTable } from '@/components/admin/AdminTable'
import { AdminBadge } from '@/components/admin/AdminBadge'
import AdminDrawer from '@/components/admin/AdminDrawer'
import AdminConfirmModal from '@/components/admin/AdminConfirmModal'
import { adminColors, adminFonts, adminCard } from '@/components/admin/admin-tokens'

/* ─── types ─── */

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

interface RondaListItem {
  id: string; codigo: string; course_name: string; holes: number; estado: string
  created_at: string; tees: string; modo_juego: string; jugadores_count: number
}

type Tab = 'torneos' | 'rondas' | 'usuarios' | 'taiger'

const tabs: { key: Tab; label: string }[] = [
  { key: 'torneos', label: 'Torneos' },
  { key: 'rondas', label: 'Rondas' },
  { key: 'usuarios', label: 'Usuarios' },
  { key: 'taiger', label: 'tAIger' },
]

/* ─── shared styles ─── */

const inputStyle: React.CSSProperties = {
  background: adminColors.bg, border: `1px solid ${adminColors.border}`,
  borderRadius: '8px', padding: '8px 14px', color: adminColors.ivory,
  fontSize: '13px', outline: 'none', width: '100%',
  fontFamily: "'DM Sans', sans-serif", boxSizing: 'border-box' as const,
}

const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }

const btnPrimary: React.CSSProperties = {
  background: adminColors.gold, color: '#000', border: 'none', borderRadius: '8px',
  padding: '10px 20px', fontFamily: "'DM Sans', sans-serif", fontSize: '13px',
  fontWeight: 600, cursor: 'pointer',
}

const btnDanger: React.CSSProperties = {
  background: 'transparent', color: adminColors.red, border: `1px solid ${adminColors.red}`,
  borderRadius: '8px', padding: '10px 20px', fontFamily: "'DM Sans', sans-serif",
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}

const btnWarning: React.CSSProperties = {
  background: 'transparent', color: adminColors.yellow, border: `1px solid ${adminColors.yellow}`,
  borderRadius: '8px', padding: '10px 20px', fontFamily: "'DM Sans', sans-serif",
  fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}

const fieldLabel: React.CSSProperties = { ...adminFonts.label, display: 'block', marginBottom: '6px' }
const fieldGroup: React.CSSProperties = { marginBottom: '16px' }
const drawerSection: React.CSSProperties = {
  ...adminCard, marginBottom: '16px', padding: '16px',
}
const errorBox: React.CSSProperties = {
  background: adminColors.redDim, color: adminColors.red, borderRadius: '8px',
  padding: '10px 14px', fontSize: '13px', marginBottom: '12px',
}

/* ─── main page ─── */

export default function GolfOpsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('torneos')
  const [ops, setOps] = useState<GolfOpsData | null>(null)
  const [users, setUsers] = useState<UsersData | null>(null)
  const [rondasList, setRondasList] = useState<RondaListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [usersLoading, setUsersLoading] = useState(false)
  const [rondasListLoading, setRondasListLoading] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userPage, setUserPage] = useState(1)

  /* ─── drawer state ─── */
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTitle, setDrawerTitle] = useState('')
  const [drawerContent, setDrawerContent] = useState<React.ReactNode>(null)
  const [drawerFooter, setDrawerFooter] = useState<React.ReactNode>(null)

  /* ─── confirm modal state ─── */
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTitle, setConfirmTitle] = useState('')
  const [confirmMessage, setConfirmMessage] = useState('')
  const [confirmText, setConfirmText] = useState('ELIMINAR')
  const [confirmLoading, setConfirmLoading] = useState(false)
  const [confirmVariant, setConfirmVariant] = useState<'danger' | 'warning'>('danger')
  const [onConfirmAction, setOnConfirmAction] = useState<() => void>(() => () => {})

  const closeDrawer = () => { setDrawerOpen(false); setDrawerContent(null); setDrawerFooter(null) }

  /* ─── data fetching ─── */

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

  const fetchRondasList = useCallback(async () => {
    setRondasListLoading(true)
    try {
      const res = await fetch('/api/admin/rondas-libres')
      if (res.ok) {
        const data = await res.json()
        setRondasList(data.rondas ?? [])
      }
    } catch { /* silent */ } finally { setRondasListLoading(false) }
  }, [])

  useEffect(() => { fetchOps() }, [fetchOps])

  useEffect(() => {
    if (activeTab === 'usuarios') fetchUsers(userSearch, userPage)
  }, [activeTab, userSearch, userPage, fetchUsers])

  useEffect(() => {
    if (activeTab === 'rondas') fetchRondasList()
  }, [activeTab, fetchRondasList])

  /* ─── helpers ─── */

  const statusVariant = (s: string) => {
    if (s === 'active' || s === 'en_curso') return 'warning' as const
    if (s === 'finished' || s === 'finalizada') return 'success' as const
    if (s === 'draft') return 'neutral' as const
    return 'neutral' as const
  }

  /* ═══════════════════════════════════════════
     TORNEO DRAWER
     ═══════════════════════════════════════════ */

  const openTournamentDrawer = async (tournamentId: string) => {
    setDrawerTitle('Torneo')
    setDrawerContent(<div style={{ textAlign: 'center', padding: '40px 0', color: adminColors.gray }}>Cargando...</div>)
    setDrawerFooter(null)
    setDrawerOpen(true)

    try {
      const res = await fetch(`/api/admin/tournaments/${tournamentId}`)
      if (!res.ok) throw new Error('Error cargando torneo')
      const data = await res.json()
      renderTournamentDrawer(data.tournament, data.players ?? [], data.rounds ?? [])
    } catch (err: any) {
      setDrawerContent(<div style={errorBox}>{err?.message ?? 'Error desconocido'}</div>)
    }
  }

  const renderTournamentDrawer = (
    tournament: any,
    players: any[],
    rounds: any[],
  ) => {
    let editName = tournament.name ?? ''
    let editStatus = tournament.status ?? 'draft'
    let saving = false
    let error = ''

    const render = () => {
      setDrawerTitle(editName || 'Torneo')
      setDrawerContent(
        <div>
          {error && <div style={errorBox}>{error}</div>}

          {/* Editable fields */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>NOMBRE</label>
            <input
              defaultValue={editName}
              onChange={e => { editName = e.target.value }}
              style={inputStyle}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={fieldGroup}>
              <label style={fieldLabel}>STATUS</label>
              <select
                defaultValue={editStatus}
                onChange={e => { editStatus = e.target.value }}
                style={selectStyle}
              >
                <option value="draft">draft</option>
                <option value="active">active</option>
                <option value="closed">closed</option>
              </select>
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>FORMATO</label>
              <span style={adminFonts.body}>{tournament.format || '-'}</span>
            </div>
          </div>

          <div style={fieldGroup}>
            <label style={fieldLabel}>HOYOS</label>
            <span style={adminFonts.body}>{tournament.hole_count ?? '-'}</span>
          </div>

          {/* Players */}
          <div style={drawerSection}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>
              JUGADORES ({players.length})
            </span>
            {players.length === 0 ? (
              <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin jugadores</span>
            ) : (
              players.map((p: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: i < players.length - 1 ? `1px solid ${adminColors.border}` : 'none',
                }}>
                  <span style={adminFonts.body}>{p.profiles?.name ?? p.user_id?.slice(0, 8)}</span>
                  <span style={adminFonts.mono}>{p.profiles?.email ?? ''}</span>
                </div>
              ))
            )}
          </div>

          {/* Rounds */}
          <div style={drawerSection}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>
              RONDAS ({rounds.length})
            </span>
            {rounds.length === 0 ? (
              <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin rondas</span>
            ) : (
              rounds.map((r: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', padding: '6px 0',
                  borderBottom: i < rounds.length - 1 ? `1px solid ${adminColors.border}` : 'none',
                }}>
                  <span style={adminFonts.mono}>Ronda {r.round_number ?? i + 1}</span>
                  <span style={{ ...adminFonts.body, color: adminColors.gold }}>
                    Total: {r.total_gross ?? '-'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>,
      )

      setDrawerFooter(
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between' }}>
          <button
            style={btnDanger}
            onClick={() => {
              setConfirmTitle('Eliminar Torneo')
              setConfirmMessage(`Se eliminara permanentemente el torneo "${editName}" y todas sus rondas y scores asociados.`)
              setConfirmText('ELIMINAR')
              setConfirmVariant('danger')
              setOnConfirmAction(() => async () => {
                setConfirmLoading(true)
                try {
                  const res = await fetch(`/api/admin/tournaments/${tournament.id}`, { method: 'DELETE' })
                  if (!res.ok) throw new Error('Error eliminando torneo')
                  setConfirmOpen(false)
                  closeDrawer()
                  fetchOps()
                } catch { /* silent */ } finally { setConfirmLoading(false) }
              })
              setConfirmOpen(true)
            }}
          >Eliminar torneo</button>
          <button
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            disabled={saving}
            onClick={async () => {
              saving = true; error = ''; render()
              try {
                const res = await fetch(`/api/admin/tournaments/${tournament.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: editName, status: editStatus }),
                })
                if (!res.ok) throw new Error('Error guardando cambios')
                closeDrawer()
                fetchOps()
              } catch (e: any) {
                error = e?.message ?? 'Error'; saving = false; render()
              }
            }}
          >{saving ? '...' : 'Guardar cambios'}</button>
        </div>,
      )
    }

    render()
  }

  /* ═══════════════════════════════════════════
     RONDA DRAWER
     ═══════════════════════════════════════════ */

  const openRondaDrawer = async (rondaId: string) => {
    setDrawerTitle('Ronda Libre')
    setDrawerContent(<div style={{ textAlign: 'center', padding: '40px 0', color: adminColors.gray }}>Cargando...</div>)
    setDrawerFooter(null)
    setDrawerOpen(true)

    try {
      const res = await fetch(`/api/admin/rondas-libres/${rondaId}`)
      if (!res.ok) throw new Error('Error cargando ronda')
      const data = await res.json()
      renderRondaDrawer(data.ronda, data.jugadores ?? [])
    } catch (err: any) {
      setDrawerContent(<div style={errorBox}>{err?.message ?? 'Error desconocido'}</div>)
    }
  }

  const renderRondaDrawer = (ronda: any, jugadores: any[]) => {
    const modifiedScores: Record<string, { jugadorId: string; scores: number[] }> = {}
    let saving = false
    let error = ''

    const render = () => {
      setDrawerTitle(`Ronda ${ronda.codigo ?? ronda.id.slice(0, 8)}`)
      setDrawerContent(
        <div>
          {error && <div style={errorBox}>{error}</div>}

          {/* Info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
            <div style={fieldGroup}>
              <span style={fieldLabel}>CODIGO</span>
              <span style={adminFonts.mono}>{ronda.codigo ?? '-'}</span>
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>CANCHA</span>
              <span style={adminFonts.body}>{ronda.course_name ?? '-'}</span>
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>TEES</span>
              <span style={adminFonts.body}>{ronda.tees ?? '-'}</span>
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>HOYOS</span>
              <span style={adminFonts.body}>{ronda.holes ?? '-'}</span>
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>MODO</span>
              <span style={adminFonts.body}>{ronda.modo_juego ?? '-'}</span>
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>ESTADO</span>
              <AdminBadge text={ronda.estado ?? '-'} variant={statusVariant(ronda.estado)} dot />
            </div>
            <div style={fieldGroup}>
              <span style={fieldLabel}>FECHA</span>
              <span style={adminFonts.mono}>{ronda.created_at?.split('T')[0] ?? '-'}</span>
            </div>
          </div>

          {/* Jugadores + scores */}
          <div style={drawerSection}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>
              JUGADORES ({jugadores.length})
            </span>
            {jugadores.length === 0 ? (
              <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin jugadores</span>
            ) : (
              jugadores.map((j: any, jIdx: number) => {
                const scores: number[] = Array.isArray(j.scores) ? j.scores : []
                return (
                  <div key={jIdx} style={{
                    marginBottom: '14px', paddingBottom: '14px',
                    borderBottom: jIdx < jugadores.length - 1 ? `1px solid ${adminColors.border}` : 'none',
                  }}>
                    <span style={{ ...adminFonts.body, fontWeight: 600, display: 'block', marginBottom: '8px' }}>
                      {j.profiles?.name ?? j.user_id?.slice(0, 8) ?? `Jugador ${jIdx + 1}`}
                    </span>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {scores.map((s: number, hIdx: number) => (
                        <input
                          key={hIdx}
                          type="number"
                          defaultValue={s}
                          onChange={e => {
                            if (!modifiedScores[j.id]) {
                              modifiedScores[j.id] = { jugadorId: j.id, scores: [...scores] }
                            }
                            modifiedScores[j.id].scores[hIdx] = Number(e.target.value) || 0
                          }}
                          style={{
                            ...inputStyle, width: '40px', padding: '4px 2px', textAlign: 'center' as const,
                            fontSize: '12px',
                          }}
                        />
                      ))}
                      {scores.length === 0 && (
                        <span style={{ color: adminColors.grayDim, fontSize: '12px' }}>Sin scores</span>
                      )}
                    </div>
                    <span style={{ ...adminFonts.mono, fontSize: '11px', marginTop: '4px', display: 'block' }}>
                      Total: {scores.reduce((a: number, b: number) => a + b, 0)}
                    </span>
                  </div>
                )
              })
            )}
          </div>
        </div>,
      )

      setDrawerFooter(
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              style={btnDanger}
              onClick={() => {
                setConfirmTitle('Eliminar Ronda')
                setConfirmMessage(`Se eliminara permanentemente la ronda "${ronda.codigo}" y todos sus jugadores.`)
                setConfirmText('ELIMINAR')
                setConfirmVariant('danger')
                setOnConfirmAction(() => async () => {
                  setConfirmLoading(true)
                  try {
                    const res = await fetch(`/api/admin/rondas-libres/${ronda.id}`, { method: 'DELETE' })
                    if (!res.ok) throw new Error('Error eliminando ronda')
                    setConfirmOpen(false)
                    closeDrawer()
                    fetchOps()
                    fetchRondasList()
                  } catch { /* silent */ } finally { setConfirmLoading(false) }
                })
                setConfirmOpen(true)
              }}
            >Eliminar</button>
            {ronda.estado === 'en_curso' && (
              <button
                style={btnWarning}
                onClick={() => {
                  setConfirmTitle('Forzar Cierre')
                  setConfirmMessage(`Se forzara el cierre de la ronda "${ronda.codigo}". Los jugadores ya no podran modificar scores.`)
                  setConfirmText('CERRAR')
                  setConfirmVariant('warning')
                  setOnConfirmAction(() => async () => {
                    setConfirmLoading(true)
                    try {
                      const res = await fetch(`/api/admin/rondas-libres/${ronda.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ estado: 'finalizada' }),
                      })
                      if (!res.ok) throw new Error('Error cerrando ronda')
                      setConfirmOpen(false)
                      closeDrawer()
                      fetchOps()
                      fetchRondasList()
                    } catch { /* silent */ } finally { setConfirmLoading(false) }
                  })
                  setConfirmOpen(true)
                }}
              >Forzar Cierre</button>
            )}
          </div>
          <button
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            disabled={saving}
            onClick={async () => {
              const entries = Object.values(modifiedScores)
              if (entries.length === 0) { closeDrawer(); return }
              saving = true; error = ''; render()
              try {
                for (const entry of entries) {
                  const res = await fetch(`/api/admin/rondas-libres/${ronda.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ jugadorId: entry.jugadorId, scores: entry.scores }),
                  })
                  if (!res.ok) throw new Error('Error guardando scores')
                }
                closeDrawer()
                fetchRondasList()
              } catch (e: any) {
                error = e?.message ?? 'Error'; saving = false; render()
              }
            }}
          >{saving ? '...' : 'Guardar Scores'}</button>
        </div>,
      )
    }

    render()
  }

  /* ═══════════════════════════════════════════
     USER DRAWER
     ═══════════════════════════════════════════ */

  const openUserDrawer = async (userId: string, userName: string) => {
    setDrawerTitle(userName || 'Usuario')
    setDrawerContent(<div style={{ textAlign: 'center', padding: '40px 0', color: adminColors.gray }}>Cargando...</div>)
    setDrawerFooter(null)
    setDrawerOpen(true)

    try {
      const res = await fetch(`/api/admin/users/${userId}`)
      if (!res.ok) throw new Error('Error cargando usuario')
      const data = await res.json()
      renderUserDrawer(data.profile, data.counts)
    } catch (err: any) {
      setDrawerContent(<div style={errorBox}>{err?.message ?? 'Error desconocido'}</div>)
    }
  }

  const renderUserDrawer = (profile: any, counts: any) => {
    let editName = profile.name ?? ''
    let editEmail = profile.email ?? ''
    let editHcp = profile.indice ?? ''
    let editRole = profile.role ?? 'player'
    let saving = false
    let error = ''

    const initials = (editName || '?').split(' ').map((w: string) => w[0] ?? '').join('').slice(0, 2).toUpperCase()

    const render = () => {
      setDrawerTitle(editName || 'Usuario')
      setDrawerContent(
        <div>
          {error && <div style={errorBox}>{error}</div>}

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              width: '56px', height: '56px', borderRadius: '50%', background: adminColors.goldDim,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: adminColors.gold, fontWeight: 700, fontSize: '18px',
              fontFamily: "'DM Sans', sans-serif",
            }}>{initials}</div>
            <div>
              <div style={{ ...adminFonts.sectionTitle }}>{editName || '-'}</div>
              <div style={{ ...adminFonts.mono, fontSize: '12px' }}>{profile.id?.slice(0, 12)}...</div>
            </div>
          </div>

          {/* Editable fields */}
          <div style={fieldGroup}>
            <label style={fieldLabel}>NOMBRE</label>
            <input defaultValue={editName} onChange={e => { editName = e.target.value }} style={inputStyle} />
          </div>
          <div style={fieldGroup}>
            <label style={fieldLabel}>EMAIL</label>
            <input defaultValue={editEmail} onChange={e => { editEmail = e.target.value }} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div style={fieldGroup}>
              <label style={fieldLabel}>HCP INDEX</label>
              <input type="number" step="0.1" defaultValue={editHcp} onChange={e => { editHcp = e.target.value }} style={inputStyle} />
            </div>
            <div style={fieldGroup}>
              <label style={fieldLabel}>ROL</label>
              <select defaultValue={editRole} onChange={e => { editRole = e.target.value }} style={selectStyle}>
                <option value="player">player</option>
                <option value="organizer">organizer</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>

          {/* Activity stats */}
          <div style={drawerSection}>
            <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>ACTIVIDAD</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ ...adminFonts.kpiSmall }}>{counts?.rondas ?? 0}</div>
                <div style={{ ...adminFonts.label, marginTop: '4px' }}>Rondas</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ ...adminFonts.kpiSmall }}>{counts?.tournaments ?? 0}</div>
                <div style={{ ...adminFonts.label, marginTop: '4px' }}>Torneos</div>
              </div>
              <div style={{ textAlign: 'center' as const }}>
                <div style={{ ...adminFonts.kpiSmall }}>{counts?.taigerSessions ?? 0}</div>
                <div style={{ ...adminFonts.label, marginTop: '4px' }}>tAIger</div>
              </div>
            </div>
          </div>
        </div>,
      )

      setDrawerFooter(
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            disabled={saving}
            onClick={async () => {
              saving = true; error = ''; render()
              try {
                const body: Record<string, unknown> = { name: editName, email: editEmail, role: editRole }
                const hcpNum = parseFloat(String(editHcp))
                if (!isNaN(hcpNum)) body.indice = hcpNum
                const res = await fetch(`/api/admin/users/${profile.id}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(body),
                })
                if (!res.ok) throw new Error('Error guardando cambios')
                closeDrawer()
                fetchUsers(userSearch, userPage)
              } catch (e: any) {
                error = e?.message ?? 'Error'; saving = false; render()
              }
            }}
          >{saving ? '...' : 'Guardar cambios'}</button>
        </div>,
      )
    }

    render()
  }

  /* ═══════════════════════════════════════════
     TAIGER SESSION DRAWER
     ═══════════════════════════════════════════ */

  const openTaigerDrawer = async (sessionId: string) => {
    setDrawerTitle('Sesion tAIger')
    setDrawerContent(<div style={{ textAlign: 'center', padding: '40px 0', color: adminColors.gray }}>Cargando...</div>)
    setDrawerFooter(null)
    setDrawerOpen(true)

    try {
      const res = await fetch(`/api/admin/taiger-sessions/${sessionId}`)
      if (!res.ok) throw new Error('Error cargando sesion')
      const data = await res.json()
      renderTaigerDrawer(data.session)
    } catch (err: any) {
      setDrawerContent(<div style={errorBox}>{err?.message ?? 'Error desconocido'}</div>)
    }
  }

  const renderTaigerDrawer = (session: any) => {
    const messages: any[] = Array.isArray(session.messages) ? session.messages : []
    const tecnicas: string[] = Array.isArray(session.assigned_techniques) ? session.assigned_techniques :
      (session.assigned_techniques ? [String(session.assigned_techniques)] : [])

    setDrawerTitle(`Sesion ${session.session_type ?? ''}`)
    setDrawerContent(
      <div>
        {/* Info */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          <div style={fieldGroup}>
            <span style={fieldLabel}>TIPO</span>
            <AdminBadge text={session.session_type ?? '-'} variant="gold" />
          </div>
          <div style={fieldGroup}>
            <span style={fieldLabel}>FECHA</span>
            <span style={adminFonts.mono}>{session.created_at?.split('T')[0] ?? '-'}</span>
          </div>
        </div>

        {tecnicas.length > 0 && (
          <div style={{ ...fieldGroup, marginBottom: '20px' }}>
            <span style={fieldLabel}>TECNICAS ASIGNADAS</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
              {tecnicas.map((t: string, i: number) => (
                <AdminBadge key={i} text={t} variant="neutral" />
              ))}
            </div>
          </div>
        )}

        {/* Transcript */}
        <div style={drawerSection}>
          <span style={{ ...adminFonts.label, display: 'block', marginBottom: '10px' }}>
            TRANSCRIPT ({messages.length} mensajes)
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '400px', overflowY: 'auto' }}>
            {messages.length === 0 && (
              <span style={{ color: adminColors.grayDim, fontSize: '13px' }}>Sin mensajes</span>
            )}
            {messages.map((m: any, i: number) => {
              const isUser = m.role === 'user'
              return (
                <div key={i} style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  background: isUser ? adminColors.goldDim : adminColors.bg,
                  border: `1px solid ${isUser ? adminColors.gold : adminColors.border}`,
                  borderRadius: '10px',
                  padding: '8px 12px',
                  fontSize: '13px',
                  color: adminColors.ivory,
                  lineHeight: 1.5,
                  fontFamily: "'DM Sans', sans-serif",
                  whiteSpace: 'pre-wrap' as const,
                  wordBreak: 'break-word' as const,
                }}>
                  {m.content ?? ''}
                </div>
              )
            })}
          </div>
        </div>
      </div>,
    )

    setDrawerFooter(
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <button
          style={btnDanger}
          onClick={() => {
            setConfirmTitle('Eliminar Sesion')
            setConfirmMessage('Se eliminara permanentemente esta sesion de tAIger.')
            setConfirmText('ELIMINAR')
            setConfirmVariant('danger')
            setOnConfirmAction(() => async () => {
              setConfirmLoading(true)
              try {
                const res = await fetch(`/api/admin/taiger-sessions/${session.id}`, { method: 'DELETE' })
                if (!res.ok) throw new Error('Error eliminando sesion')
                setConfirmOpen(false)
                closeDrawer()
                fetchOps()
              } catch { /* silent */ } finally { setConfirmLoading(false) }
            })
            setConfirmOpen(true)
          }}
        >Eliminar Sesion</button>
      </div>,
    )
  }

  /* ─── row data mappings ─── */

  const tournamentRows = (ops?.tournaments.list ?? []).map(t => ({
    _id: t.id,
    name: t.name,
    status: t.status,
    holes: t.hole_count,
    date: t.created_at?.split('T')[0] ?? '-',
  }))

  const userRows = (users?.users ?? []).map(u => ({
    _id: u.id,
    _name: u.name,
    name: u.name || '-',
    email: u.email || '-',
    hcp: u.indice != null ? String(u.indice) : '-',
    registro: u.created_at?.split('T')[0] ?? '-',
    role: u.role || 'user',
  }))

  const rondaRows = rondasList.map(r => ({
    _id: r.id,
    codigo: r.codigo ?? '-',
    cancha: r.course_name ?? '-',
    hoyos: r.holes ?? '-',
    jugadores: r.jugadores_count ?? 0,
    estado: r.estado ?? '-',
    fecha: r.created_at?.split('T')[0] ?? '-',
  }))

  const taigerRows = (ops?.taiger.recentSessions ?? []).map(s => ({
    _id: s.id,
    tipo: s.session_type ?? '-',
    fecha: s.created_at?.split('T')[0] ?? '-',
    id_corto: s.id?.slice(0, 8) ?? '-',
  }))

  /* ─── render ─── */

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

      {/* ══════ Torneos ══════ */}
      {activeTab === 'torneos' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            <AdminCard icon="🏆" label="Total Torneos" value={ops?.tournaments.total ?? 0} loading={loading} />
          </div>
          <AdminTable<{ _id: string; name: string; status: string; holes: number; date: string }>
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
            onRowClick={(row) => openTournamentDrawer(row._id)}
          />
        </>
      )}

      {/* ══════ Rondas ══════ */}
      {activeTab === 'rondas' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
            <AdminCard icon="⛳" label="Total Rondas Libres" value={ops?.rondasLibres.total ?? 0} loading={loading} />
            <AdminCard icon="🟢" label="En Curso" value={ops?.rondasLibres.enCurso ?? 0} loading={loading} />
            <AdminCard icon="✅" label="Finalizadas" value={ops?.rondasLibres.finalizadas ?? 0} loading={loading} />
            <AdminCard icon="📝" label="Total Scores" value={ops?.scoring.totalHoleScores ?? 0} loading={loading} />
            <AdminCard icon="🔄" label="Total Rounds" value={ops?.scoring.totalRounds ?? 0} loading={loading} />
            <AdminCard icon="🎯" label="Total Hole Scores" value={ops?.scoring.totalHoleScores ?? 0} loading={loading} />
          </div>
          <AdminTable<{ _id: string; codigo: string; cancha: string; hoyos: number | string; jugadores: number; estado: string; fecha: string }>
            columns={[
              { key: 'codigo', label: 'Codigo' },
              { key: 'cancha', label: 'Cancha' },
              { key: 'hoyos', label: 'Hoyos', width: '70px' },
              { key: 'jugadores', label: 'Jugadores', width: '90px' },
              {
                key: 'estado', label: 'Estado', width: '110px',
                render: (row) => <AdminBadge text={row.estado} variant={statusVariant(row.estado)} dot />,
              },
              { key: 'fecha', label: 'Fecha', width: '110px' },
            ]}
            data={rondaRows}
            loading={rondasListLoading}
            onRowClick={(row) => openRondaDrawer(row._id)}
          />
        </>
      )}

      {/* ══════ Usuarios ══════ */}
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
          <AdminTable<{ _id: string; _name: string; name: string; email: string; hcp: string; registro: string; role: string }>
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
            onRowClick={(row) => openUserDrawer(row._id, row._name)}
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

      {/* ══════ tAIger ══════ */}
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

          {/* Recent sessions table */}
          <AdminTable<{ _id: string; tipo: string; fecha: string; id_corto: string }>
            columns={[
              {
                key: 'tipo', label: 'Tipo', width: '140px',
                render: (row) => <AdminBadge text={row.tipo} variant="gold" />,
              },
              { key: 'fecha', label: 'Fecha', width: '120px' },
              { key: 'id_corto', label: 'ID', width: '100px' },
            ]}
            data={taigerRows}
            loading={loading}
            onRowClick={(row) => openTaigerDrawer(row._id)}
          />
        </>
      )}

      {/* ══════ Shared Drawer ══════ */}
      <AdminDrawer open={drawerOpen} onClose={closeDrawer} title={drawerTitle} footer={drawerFooter}>
        {drawerContent}
      </AdminDrawer>

      {/* ══════ Shared Confirm Modal ══════ */}
      <AdminConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirmAction}
        title={confirmTitle}
        message={confirmMessage}
        confirmText={confirmText}
        loading={confirmLoading}
        variant={confirmVariant}
      />
    </div>
  )
}
