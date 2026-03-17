'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Design tokens ──
const colors = {
  bg: '#050b14',
  card: '#0a1628',
  border: '#132540',
  gold: '#c4992a',
  ivory: '#edeae4',
  gray: '#7a8fa8',
  green: '#16a34a',
  red: '#dc2626',
}

const font = {
  kpi: { fontFamily: "'Playfair Display', serif", fontSize: '2.5rem', color: colors.gold, fontWeight: 700 as const },
  label: { fontFamily: "'DM Sans', sans-serif", fontSize: '12px', color: colors.gray },
}

// ── Types ──
interface User {
  id: string
  name: string | null
  email: string | null
  handicap_index: number | null
  created_at: string
  role: string | null
  avatar_url: string | null
}

const PER_PAGE = 20

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return dateStr
  }
}

function getInitials(name: string | null) {
  if (!name) return '?'
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ── Drawer ──
function UserDrawer({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
        }}
      />
      {/* Drawer panel */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          maxWidth: '100vw',
          background: colors.card,
          borderLeft: `1px solid ${colors.border}`,
          zIndex: 1000,
          overflowY: 'auto',
          animation: 'slideIn 0.25s ease-out',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 24px',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <span style={{ ...font.label, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Detalle de Usuario
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: colors.gray,
              fontSize: '24px',
              cursor: 'pointer',
              padding: '4px 8px',
              lineHeight: 1,
            }}
            aria-label="Cerrar"
          >
            &times;
          </button>
        </div>

        {/* Avatar + name */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: '32px 24px 24px',
            gap: '12px',
          }}
        >
          <div
            style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `linear-gradient(135deg, ${colors.gold}, ${colors.border})`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Playfair Display', serif",
              fontSize: '1.75rem',
              color: colors.bg,
              fontWeight: 700,
            }}
          >
            {getInitials(user.name)}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: '1.25rem',
                color: colors.ivory,
                fontWeight: 700,
              }}
            >
              {user.name || 'Sin nombre'}
            </div>
            <div style={{ ...font.label, marginTop: '4px' }}>{user.email || 'Sin email'}</div>
          </div>
          {user.handicap_index !== null && user.handicap_index !== undefined && (
            <div
              style={{
                background: colors.bg,
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '8px 20px',
                textAlign: 'center',
              }}
            >
              <div style={font.kpi as React.CSSProperties}>{user.handicap_index}</div>
              <div style={font.label}>HCP Index</div>
            </div>
          )}
        </div>

        {/* Stats cards */}
        <div style={{ padding: '0 24px 24px', display: 'flex', gap: '12px' }}>
          <div
            style={{
              flex: 1,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: '14px',
                color: colors.ivory,
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              {user.role || 'user'}
            </div>
            <div style={{ ...font.label, marginTop: '4px' }}>Rol</div>
          </div>
          <div
            style={{
              flex: 1,
              background: colors.bg,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '14px', color: colors.ivory, fontWeight: 600 }}>
              {formatDate(user.created_at)}
            </div>
            <div style={{ ...font.label, marginTop: '4px' }}>Registro</div>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Main ──
export default function AdminUsuariosPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selectedUser, setSelectedUser] = useState<User | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users ?? [])
      }
    } catch {
      /* silently fail */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Filter
  const filtered = users.filter((u) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (u.name && u.name.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q))
    )
  })

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE))
  const safeP = Math.min(page, totalPages)
  const paged = filtered.slice((safeP - 1) * PER_PAGE, safeP * PER_PAGE)

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes slideIn {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
      `}</style>

      <div
        style={{
          minHeight: '100vh',
          background: colors.bg,
          color: colors.ivory,
          fontFamily: "'DM Sans', sans-serif",
          padding: '32px',
        }}
      >
        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: '1.75rem',
            color: colors.gold,
            marginBottom: '24px',
          }}
        >
          Usuarios
        </h1>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'center',
            marginBottom: '20px',
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              padding: '8px 20px',
              background: colors.gold,
              color: colors.bg,
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'default',
            }}
          >
            Todos ({filtered.length})
          </div>
          <input
            type="text"
            placeholder="Buscar por nombre o email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            style={{
              background: colors.card,
              border: `1px solid ${colors.border}`,
              borderRadius: '8px',
              padding: '8px 14px',
              color: colors.ivory,
              fontSize: '13px',
              outline: 'none',
              flex: '1 1 220px',
              maxWidth: '360px',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>

        {/* Table */}
        <div
          style={{
            background: colors.card,
            border: `1px solid ${colors.border}`,
            borderRadius: '12px',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr 1.2fr 80px 120px 80px',
              padding: '12px 20px',
              borderBottom: `1px solid ${colors.border}`,
              gap: '8px',
            }}
          >
            {['#', 'Nombre', 'Email', 'HCP', 'Registro', 'Role'].map((h) => (
              <span key={h} style={{ ...font.label, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {h}
              </span>
            ))}
          </div>

          {/* Body */}
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr 1.2fr 80px 120px 80px',
                  padding: '14px 20px',
                  borderBottom: `1px solid ${colors.border}`,
                  gap: '8px',
                }}
              >
                {Array.from({ length: 6 }).map((__, j) => (
                  <div
                    key={j}
                    style={{
                      height: '16px',
                      borderRadius: '4px',
                      width: j === 0 ? '24px' : '80%',
                      background: `linear-gradient(90deg, ${colors.border} 25%, ${colors.card} 50%, ${colors.border} 75%)`,
                      backgroundSize: '200% 100%',
                      animation: 'shimmer 1.5s infinite',
                    }}
                  />
                ))}
              </div>
            ))
          ) : paged.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: colors.gray,
                fontSize: '14px',
              }}
            >
              No se encontraron usuarios
            </div>
          ) : (
            paged.map((user, i) => (
              <div
                key={user.id}
                onClick={() => setSelectedUser(user)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr 1.2fr 80px 120px 80px',
                  padding: '14px 20px',
                  borderBottom: `1px solid ${colors.border}`,
                  gap: '8px',
                  cursor: 'pointer',
                  transition: 'background 0.15s',
                  alignItems: 'center',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = colors.border)}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ ...font.label }}>{(safeP - 1) * PER_PAGE + i + 1}</span>
                <span
                  style={{
                    fontSize: '14px',
                    color: colors.ivory,
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.name || 'Sin nombre'}
                </span>
                <span
                  style={{
                    ...font.label,
                    fontSize: '13px',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {user.email || '-'}
                </span>
                <span style={{ fontSize: '14px', color: colors.gold, fontWeight: 600 }}>
                  {user.handicap_index ?? '-'}
                </span>
                <span style={{ ...font.label, fontSize: '12px' }}>{formatDate(user.created_at)}</span>
                <span
                  style={{
                    fontSize: '11px',
                    color: user.role === 'admin' ? colors.gold : colors.gray,
                    fontWeight: 600,
                    textTransform: 'capitalize',
                  }}
                >
                  {user.role || 'user'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '16px',
              marginTop: '20px',
            }}
          >
            <button
              disabled={safeP <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              style={{
                background: safeP <= 1 ? colors.border : colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                padding: '8px 16px',
                color: safeP <= 1 ? colors.gray : colors.ivory,
                cursor: safeP <= 1 ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Anterior
            </button>
            <span style={{ ...font.label, fontSize: '13px' }}>
              P&aacute;gina {safeP} de {totalPages}
            </span>
            <button
              disabled={safeP >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              style={{
                background: safeP >= totalPages ? colors.border : colors.card,
                border: `1px solid ${colors.border}`,
                borderRadius: '6px',
                padding: '8px 16px',
                color: safeP >= totalPages ? colors.gray : colors.ivory,
                cursor: safeP >= totalPages ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {/* Drawer */}
      {selectedUser && <UserDrawer user={selectedUser} onClose={() => setSelectedUser(null)} />}
    </>
  )
}
