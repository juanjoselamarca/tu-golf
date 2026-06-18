'use client'

/**
 * Estilos del markdown del coach + animaciones del spinner (idéntico al original
 * page.tsx:763-790). Extraído para no inflar la page.
 */
export function ChatStyles() {
  return (
    <style>{`
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
      @keyframes taigerPulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.4); opacity: 0.4; }
      }
      .taiger-md > *:first-child { margin-top: 0; }
      .taiger-md > *:last-child { margin-bottom: 0; }
      .taiger-md p { margin: 0 0 10px 0; }
      .taiger-md strong { color: #f3d37a; font-weight: 600; }
      .taiger-md em { color: #c4d8ee; }
      .taiger-md ul, .taiger-md ol { margin: 6px 0 10px 0; padding-left: 20px; }
      .taiger-md li { margin: 2px 0; }
      .taiger-md h1, .taiger-md h2, .taiger-md h3 {
        margin: 12px 0 6px 0; font-size: 15px; color: #f3d37a; font-weight: 600;
      }
      .taiger-md code {
        background: rgba(255,255,255,0.08); padding: 1px 6px;
        border-radius: 4px; font-size: 13px;
      }
      .taiger-md hr {
        border: none; border-top: 1px solid rgba(196,153,42,0.25); margin: 12px 0;
      }
      .taiger-md a { color: #c4992a; }
    `}</style>
  )
}
