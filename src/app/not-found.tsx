import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      background: '#070d18', minHeight: '100vh',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', textAlign: 'center',
    }}>
      <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#9971;</div>
      <h1 style={{
        fontFamily: '"Playfair Display", serif',
        fontSize: '28px', fontWeight: 700, color: '#edeae4',
        marginBottom: '8px',
      }}>
        Página no encontrada
      </h1>
      <p style={{ fontSize: '14px', color: '#94a8c0', marginBottom: '24px', maxWidth: '320px' }}>
        Esta página no existe. El link puede haber cambiado o expirado.
      </p>
      <Link href="/" style={{
        background: '#c4992a', color: '#070d18', fontWeight: 700,
        fontSize: '14px', padding: '12px 24px', borderRadius: '10px',
        textDecoration: 'none',
      }}>
        Ir al inicio
      </Link>
    </div>
  )
}
