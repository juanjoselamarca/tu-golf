// src/app/organizador/nuevo/components/DraftEditorStyles.tsx
//
// CSS responsive del editor inyectado vía <style>. En desktop (>= 1024px)
// ajusta padding/gap, y aplica el polish premium global a las cards de las
// 11 secciones (evita editar cada archivo individualmente).

export function DraftEditorStyles() {
  const css = `
    @media (min-width: 1024px) {
      .draft-editor-page {
        padding: 28px 24px 96px !important;
      }
      .draft-editor-form {
        gap: 18px !important;
      }
    }

    /* Cards de cada sección — polish premium global */
    .draft-editor-form section {
      border-radius: 16px !important;
      background: var(--bg-surface) !important;
      border: 1px solid var(--border) !important;
      box-shadow: var(--shadow-card), 0 4px 12px rgba(10, 20, 25, 0.03));
      padding: 22px !important;
      transition: box-shadow 200ms ease, border-color 200ms ease;
    }
    .draft-editor-form section:hover {
      box-shadow: var(--shadow-md));
      border-color: var(--border-md) !important;
    }
    .draft-editor-form section h2 {
      font-size: 17px !important;
      font-weight: 600 !important;
      letter-spacing: -0.01em;
      color: var(--text) !important;
    }
    .draft-editor-form section label {
      letter-spacing: 0.01em;
    }
    /* Inputs: focus state premium gold */
    .draft-editor-form section input,
    .draft-editor-form section select,
    .draft-editor-form section textarea {
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .draft-editor-form section input:focus,
    .draft-editor-form section select:focus,
    .draft-editor-form section textarea:focus {
      border-color: var(--brand-on-bg) !important;
      box-shadow: 0 0 0 3px rgba(196, 153, 42, 0.15);
    }
  `
  return <style dangerouslySetInnerHTML={{ __html: css }} />
}
