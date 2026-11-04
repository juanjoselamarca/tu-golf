'use client'

import { createClient } from '@/lib/supabase'
import { FONT_SIZE } from '@/lib/font-size'

export default function LogoutButton() {
  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text-2)',
        fontSize: FONT_SIZE.small,
        padding: '6px 12px',
        borderRadius: '6px',
        transition: 'color 200ms',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text)')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)')}
    >
      Salir
    </button>
  )
}
