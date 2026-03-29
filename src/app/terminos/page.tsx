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

export default function TerminosPage() {
  return (
    <div style={S.page}>
      <div style={S.container}>
        <div style={S.banner}>
          Documento pendiente de revisi&oacute;n legal profesional
        </div>

        <p style={S.date}>Vigente desde 29 marzo 2026</p>
        <h1 style={S.h1}>T&eacute;rminos y Condiciones</h1>

        <h2 style={S.h2}>1. Identificaci&oacute;n del operador</h2>
        <p style={S.body}>
          La plataforma Golfers+ es operada por Juan Jos&eacute; Lamarca, con domicilio en Santiago, Chile. Para consultas, escribir a{' '}
          <a href="mailto:juanjoselamarca@gmail.com" style={S.link}>juanjoselamarca@gmail.com</a>.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>2. Descripci&oacute;n del servicio</h2>
        <p style={S.body}>
          Golfers+ es una plataforma de scoring para golf amateur que incluye:
        </p>
        <ul style={S.list}>
          <li>Registro y seguimiento de scores de golf.</li>
          <li>GWI&trade; (Golfers Weighted Index): &iacute;ndice propietario de rendimiento.</li>
          <li>tAIger+: coach de golf impulsado por inteligencia artificial.</li>
          <li>Leaderboard y estad&iacute;sticas de juego.</li>
        </ul>

        <div style={S.separator} />

        <h2 style={S.h2}>3. Requisitos del usuario</h2>
        <p style={S.body}>
          Para utilizar Golfers+ el usuario debe tener al menos 13 a&ntilde;os de edad. Los menores de 18 a&ntilde;os deben contar con
          autorizaci&oacute;n de un padre o tutor legal.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>4. Disclaimer de tAIger+</h2>
        <p style={S.body}>
          Los an&aacute;lisis y recomendaciones generados por tAIger+ tienen car&aacute;cter <strong>orientativo</strong> y
          est&aacute;n basados en modelos de inteligencia artificial. <strong>No constituyen asesor&iacute;a deportiva profesional</strong>.
          El usuario es responsable de evaluar y decidir si aplica las sugerencias proporcionadas. Golfers+ no garantiza
          mejoras espec&iacute;ficas en el rendimiento deportivo derivadas del uso de tAIger+.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>5. Propiedad intelectual</h2>
        <p style={S.body}>
          Las marcas Golfers+, tAIger+ y CPI&trade; son propiedad de Golfers+. Todo el dise&ntilde;o, c&oacute;digo y contenido
          original de la plataforma est&aacute;n protegidos por derechos de autor.
        </p>
        <p style={S.body}>
          Los datos ingresados por el usuario (scores, rondas, perfil) son y seguir&aacute;n siendo propiedad del usuario.
          El usuario puede solicitar la exportaci&oacute;n o eliminaci&oacute;n de sus datos en cualquier momento.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>6. Precisi&oacute;n de los datos</h2>
        <p style={S.body}>
          Los scores y datos de juego son ingresados directamente por los usuarios. Golfers+ no verifica la
          precisi&oacute;n de los mismos ni se hace responsable por errores en la carga de informaci&oacute;n.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>7. Modificaciones a los t&eacute;rminos</h2>
        <p style={S.body}>
          Golfers+ se reserva el derecho de modificar estos t&eacute;rminos con un aviso previo m&iacute;nimo de
          30 d&iacute;as calendario, comunicado a trav&eacute;s de la plataforma y/o por correo electr&oacute;nico.
          El uso continuado del servicio tras la notificaci&oacute;n implica aceptaci&oacute;n de los nuevos t&eacute;rminos.
        </p>

        <div style={S.separator} />

        <h2 style={S.h2}>8. Legislaci&oacute;n aplicable y jurisdicci&oacute;n</h2>
        <p style={S.body}>
          Estos t&eacute;rminos se rigen por las leyes de la Rep&uacute;blica de Chile. Cualquier controversia
          ser&aacute; sometida a los tribunales ordinarios de la ciudad de Santiago de Chile.
        </p>

        <div style={S.separator} />

        <p style={{ ...S.body, color: 'var(--text-3)', marginTop: 24 }}>
          &Uacute;ltima actualizaci&oacute;n: 29 de marzo de 2026
        </p>

        <p style={{ ...S.body, marginTop: 8 }}>
          <Link href="/privacidad" style={S.link}>Pol&iacute;tica de Privacidad</Link>
          {' · '}
          <Link href="/reembolsos" style={S.link}>Pol&iacute;tica de Reembolsos</Link>
        </p>
      </div>
    </div>
  )
}
