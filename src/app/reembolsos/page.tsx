'use client'

import Link from 'next/link'

const S = {
  page: {
    background: 'var(--bg)',
    minHeight: '100vh',
    padding: '24px 16px 80px',
  } as React.CSSProperties,
  container: {
    maxWidth: 680,
    margin: '0 auto',
  } as React.CSSProperties,
  banner: {
    background: 'rgba(200,165,90,0.10)',
    border: '1px solid rgba(200,165,90,0.25)',
    borderRadius: 8,
    padding: '10px 16px',
    marginBottom: 32,
    textAlign: 'center' as const,
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 13,
    color: 'var(--gold)',
    letterSpacing: '0.02em',
  } as React.CSSProperties,
  date: {
    fontFamily: 'var(--font-dm-mono), monospace',
    fontSize: 11,
    color: 'var(--text-3)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    marginBottom: 8,
  } as React.CSSProperties,
  h1: {
    fontFamily: 'var(--font-playfair), serif',
    fontSize: 28,
    fontWeight: 700,
    color: 'var(--ivory)',
    marginBottom: 32,
    lineHeight: 1.3,
  } as React.CSSProperties,
  h2: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 17,
    fontWeight: 600,
    color: 'var(--gold)',
    marginTop: 36,
    marginBottom: 12,
  } as React.CSSProperties,
  body: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
  } as React.CSSProperties,
  separator: {
    borderTop: '1px solid rgba(200,165,90,0.18)',
    margin: '36px 0',
  } as React.CSSProperties,
  link: {
    color: 'var(--brand)',
    textDecoration: 'underline',
  } as React.CSSProperties,
  list: {
    fontFamily: 'var(--font-dm-sans)',
    fontSize: 14,
    fontWeight: 400,
    color: 'var(--text)',
    lineHeight: 1.7,
    marginBottom: 16,
    paddingLeft: 24,
  } as React.CSSProperties,
}

export default function ReembolsosPage() {
  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={S.banner}>
          Documento pendiente de revisi&oacute;n legal profesional
        </div>

        <p style={S.date}>Vigente desde 29 marzo 2026</p>
        <h1 style={S.h1}>Pol&iacute;tica de Reembolsos</h1>

        <p style={S.body}>
          Esta pol&iacute;tica se rige por la Ley 19.496 sobre Protecci&oacute;n de los Derechos de los Consumidores
          de Chile y aplica a todos los servicios ofrecidos por Golfers+.
        </p>

        <h2 style={S.h2}>1. Servicio actual</h2>
        <p style={S.body}>
          Actualmente Golfers+ es un servicio gratuito. No se cobra a los usuarios por el uso de la plataforma,
          por lo que no aplican reembolsos en esta etapa.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>2. Planes pagos futuros</h2>
        <p style={S.body}>
          Cuando Golfers+ introduzca planes de pago, aplicar&aacute;n las siguientes condiciones:
        </p>
        <ul style={S.list}>
          <li>
            <strong>Derecho de retracto:</strong> el usuario tendr&aacute; 10 d&iacute;as h&aacute;biles desde la contrataci&oacute;n
            para arrepentirse sin expresi&oacute;n de causa, conforme al Art&iacute;culo 3&deg; bis de la Ley 19.496.
          </li>
          <li>
            El reembolso ser&aacute; total si se ejerce dentro del plazo establecido.
          </li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>3. C&oacute;mo solicitar un reembolso</h2>
        <p style={S.body}>
          Para solicitar un reembolso, enviar un correo a{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>{' '}
          con el asunto <strong>&ldquo;REEMBOLSO&rdquo;</strong>, incluyendo:
        </p>
        <ul style={S.list}>
          <li>Nombre completo y correo registrado en Golfers+.</li>
          <li>Fecha de la contrataci&oacute;n del plan.</li>
          <li>Motivo de la solicitud (opcional).</li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>4. Procesamiento</h2>
        <p style={S.body}>
          Las solicitudes de reembolso ser&aacute;n procesadas en un plazo de 5 a 10 d&iacute;as h&aacute;biles.
          El reembolso se realizar&aacute; a trav&eacute;s del mismo medio de pago utilizado para la contrataci&oacute;n.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>5. Exclusiones</h2>
        <p style={S.body}>No proceder&aacute;n reembolsos en los siguientes casos:</p>
        <ul style={S.list}>
          <li>Per&iacute;odos de suscripci&oacute;n ya consumidos (proporcional al tiempo transcurrido).</li>
          <li>An&aacute;lisis de tAIger+ ya generados y entregados al usuario.</li>
          <li>Solicitudes realizadas fuera del plazo de retracto, salvo fallas t&eacute;cnicas.</li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>6. Fallas t&eacute;cnicas</h2>
        <p style={S.body}>
          En caso de fallas t&eacute;cnicas que impidan el uso del servicio contratado, el usuario
          tendr&aacute; derecho a un reembolso completo si la falla no es resuelta dentro de 30 d&iacute;as
          calendario desde la notificaci&oacute;n.
        </p>

        <div style={S.separator} />

        <p style={{ ...S.body, color: 'var(--text-3)', marginTop: 24 }}>
          &Uacute;ltima actualizaci&oacute;n: 29 de marzo de 2026
        </p>

        <p style={{ ...S.body, marginTop: 8 }}>
          <Link href="/terminos" style={S.link}>T&eacute;rminos y Condiciones</Link>
          {' · '}
          <Link href="/privacidad" style={S.link}>Pol&iacute;tica de Privacidad</Link>
        </p>
      </div>
    </div>
  )
}
