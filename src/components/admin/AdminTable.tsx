'use client'
import { useState, useMemo } from 'react'
import { adminColors, adminFonts, adminCard } from './admin-tokens'

interface Column<T> {
  key: string
  label: string
  width?: string
  render?: (row: T) => React.ReactNode
}

interface AdminTableProps<T> {
  columns: Column<T>[]
  data: T[]
  loading?: boolean
  searchPlaceholder?: string
  searchKeys?: string[]
  onRowClick?: (row: T) => void
  pageSize?: number
}

export function AdminTable<T extends Record<string, unknown>>({
  columns, data, loading, searchPlaceholder, searchKeys, onRowClick, pageSize = 15,
}: AdminTableProps<T>) {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    if (!search || !searchKeys?.length) return data
    const q = search.toLowerCase()
    return data.filter(row =>
      searchKeys.some(k => String(row[k] ?? '').toLowerCase().includes(q))
    )
  }, [data, search, searchKeys])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safeP = Math.min(page, totalPages)
  const paged = filtered.slice((safeP - 1) * pageSize, safeP * pageSize)

  const gridCols = columns.map(c => c.width || '1fr').join(' ')

  return (
    <div style={adminCard}>
      {/* Search */}
      {searchPlaceholder && (
        <div style={{ marginBottom: '16px' }}>
          <input type="text" placeholder={searchPlaceholder} value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            style={{
              background: adminColors.bg, border: `1px solid ${adminColors.border}`,
              borderRadius: '8px', padding: '8px 14px', color: adminColors.ivory,
              fontSize: '13px', outline: 'none', width: '100%', maxWidth: '360px',
              fontFamily: "'DM Sans', sans-serif",
            }}
          />
        </div>
      )}

      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: gridCols, padding: '8px 0',
        borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
      }}>
        {columns.map(c => (
          <span key={c.key} style={{ ...adminFonts.label, fontSize: '11px' }}>{c.label}</span>
        ))}
      </div>

      {/* Body */}
      {loading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: gridCols, padding: '12px 0',
            borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
          }}>
            {columns.map((_, j) => (
              <div key={j} style={{
                height: '14px', borderRadius: '4px', width: '70%',
                background: `linear-gradient(90deg, ${adminColors.border} 25%, ${adminColors.card} 50%, ${adminColors.border} 75%)`,
                backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite',
              }} />
            ))}
          </div>
        ))
      ) : paged.length === 0 ? (
        <div style={{ padding: '32px 0', textAlign: 'center', color: adminColors.gray, fontSize: '13px' }}>
          Sin resultados
        </div>
      ) : (
        paged.map((row, i) => (
          <div key={i} onClick={() => onRowClick?.(row)} style={{
            display: 'grid', gridTemplateColumns: gridCols, padding: '10px 0',
            borderBottom: `1px solid ${adminColors.border}`, gap: '8px',
            cursor: onRowClick ? 'pointer' : 'default',
            transition: 'background 0.15s', alignItems: 'center',
          }}
            onMouseEnter={e => { if (onRowClick) e.currentTarget.style.background = adminColors.cardHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            {columns.map(c => (
              <span key={c.key} style={{
                ...adminFonts.body, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {c.render ? c.render(row) : String(row[c.key] ?? '-')}
              </span>
            ))}
          </div>
        ))
      )}

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div style={{
          display: 'flex', justifyContent: 'center', alignItems: 'center',
          gap: '12px', marginTop: '16px',
        }}>
          <button disabled={safeP <= 1} onClick={() => setPage(p => p - 1)} style={{
            background: adminColors.bg, border: `1px solid ${adminColors.border}`,
            borderRadius: '6px', padding: '6px 14px', color: safeP <= 1 ? adminColors.grayDim : adminColors.ivory,
            cursor: safeP <= 1 ? 'not-allowed' : 'pointer', fontSize: '12px',
          }}>{'\u2190'}</button>
          <span style={{ ...adminFonts.mono, fontSize: '11px' }}>{safeP} / {totalPages}</span>
          <button disabled={safeP >= totalPages} onClick={() => setPage(p => p + 1)} style={{
            background: adminColors.bg, border: `1px solid ${adminColors.border}`,
            borderRadius: '6px', padding: '6px 14px', color: safeP >= totalPages ? adminColors.grayDim : adminColors.ivory,
            cursor: safeP >= totalPages ? 'not-allowed' : 'pointer', fontSize: '12px',
          }}>{'\u2192'}</button>
        </div>
      )}
    </div>
  )
}
