'use client'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { adminColors } from './admin-tokens'

const NAV_ITEMS = [
  { href: '/admin',           icon: '\u26A1', label: 'Command Center' },
  { href: '/admin/usuarios',  icon: '\uD83D\uDC65', label: 'Usuarios' },
  { href: '/admin/analytics', icon: '\uD83D\uDCCA', label: 'Analytics' },
  { href: '/admin/golf-ops',  icon: '\u26F3', label: 'Golf Ops' },
  { href: '/admin/finanzas',  icon: '\uD83D\uDCB0', label: 'Finanzas' },
  { href: '/admin/sistema',   icon: '\uD83D\uDD27', label: 'Sistema' },
]

export function AdminSidebar({ collapsed, onToggle }: {
  collapsed: boolean
  onToggle: () => void
}) {
  const pathname = usePathname()

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname.startsWith(href)

  const width = collapsed ? '64px' : '220px'

  return (
    <aside style={{
      width, minWidth: width, height: '100vh', position: 'fixed', left: 0, top: 0,
      background: adminColors.bgDeep, borderRight: `1px solid ${adminColors.border}`,
      display: 'flex', flexDirection: 'column', zIndex: 50,
      transition: 'width 0.2s ease, min-width 0.2s ease',
      overflowX: 'hidden',
    }}>
      {/* Logo area */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderBottom: `1px solid ${adminColors.border}`,
        display: 'flex', alignItems: 'center', gap: '10px',
        minHeight: '56px',
      }}>
        <button onClick={onToggle} style={{
          background: 'none', border: 'none', color: adminColors.gray,
          cursor: 'pointer', fontSize: '18px', padding: '4px',
          display: 'flex', alignItems: 'center',
        }}>
          {collapsed ? '\u2630' : '\u2715'}
        </button>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontFamily: "'Playfair Display', serif", fontSize: '15px',
              color: adminColors.ivory, fontWeight: 700,
            }}>Golfers+</span>
            <span style={{
              background: adminColors.gold, color: adminColors.bgDeep,
              fontSize: '8px', fontWeight: 800, padding: '2px 6px',
              borderRadius: '4px', letterSpacing: '0.1em',
            }}>ADMIN</span>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV_ITEMS.map(item => {
          const active = isActive(item.href)
          return (
            <Link key={item.href} href={item.href} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: collapsed ? '10px 16px' : '10px 12px',
              borderRadius: '8px', textDecoration: 'none',
              background: active ? adminColors.goldDim : 'transparent',
              color: active ? adminColors.gold : adminColors.gray,
              fontSize: '14px', fontWeight: active ? 600 : 400,
              transition: 'background 0.15s, color 0.15s',
              justifyContent: collapsed ? 'center' : 'flex-start',
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              <span style={{ fontSize: '18px', flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Back to dashboard link */}
      <div style={{
        padding: collapsed ? '16px 12px' : '16px 20px',
        borderTop: `1px solid ${adminColors.border}`,
      }}>
        <Link href="/dashboard" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          color: adminColors.grayDim, fontSize: '13px', textDecoration: 'none',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}>
          <span>{'\u2190'}</span>
          {!collapsed && <span>Volver a la app</span>}
        </Link>
      </div>
    </aside>
  )
}
