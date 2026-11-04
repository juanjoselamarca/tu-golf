import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'


// Archivos >800 LOC preexistentes, exentos de max-lines hasta que se refactoricen.
const archivosSobreLimite = [
  'src/app/ronda-libre/nueva/page.tsx',
  'src/app/ronda-libre/*/page.tsx',
  'src/app/perfil/historial/page.tsx',
  'src/app/organizador/*/jugadores/JugadoresPanel.tsx',
  'src/app/organizador/*/scoring/page.tsx',
  'src/components/import/ImportGuide.tsx',
  'src/components/CourseSelector.tsx',
  'src/app/admin/golf-ops/page.tsx',
  'src/app/admin/sistema/page.tsx',
  'src/app/demo/taiger/page.tsx',
  'src/app/api/import/screenshot/route.ts',
  'src/app/api/admin/health-check/route.ts',
  'src/app/api/inbox/webhook/route.ts',
  'src/app/api/torneos/draft/*/assistant/route.ts',
]

// iOS zooms in when a form field under 16px gets focus.
const formFieldTag = 'JSXOpeningElement[name.name=/^(input|select|textarea|Input)$/]'
const smallTextClass = '/(^|[\\s:])text-(xs|sm|caption|small|dataCaption|dataSm|\\[(\\d|1[0-5])px\\])(\\s|$)/'
const formFieldFontSizeRules = [
  `${formFieldTag} JSXAttribute[name.name='style'] Property[key.name='fontSize'] Literal[value<16]`,
  `${formFieldTag} JSXAttribute[name.name='style'] Property[key.name='fontSize'] Literal[value=/^(\\d|1[0-5])(\\.\\d+)?px$|^0?\\.\\d+r?em$/]`,
  `${formFieldTag} JSXAttribute[name.name='style'] Property[key.name='fontSize'] MemberExpression[object.name='FONT_SIZE'][property.name=/^(caption|small|dataCaption|dataSm)$/]`,
  `${formFieldTag} JSXAttribute[name.name='className'] Literal[value=${smallTextClass}]`,
  `${formFieldTag} JSXAttribute[name.name='className'] TemplateElement[value.raw=${smallTextClass}]`,
].map((selector) => ({
  selector,
  message: 'Inputs, selects and textareas need a font size of at least 16px (FONT_SIZE.body or dataBody), or iOS zooms in on focus.',
}))

export default [
  ...nextCoreWebVitals,
  {
    rules: {
      'no-console': ['warn', { allow: ['error'] }],
      'react-hooks/exhaustive-deps': 'warn',
      // Reglas nuevas del React Compiler (eslint-plugin-react-hooks 7). Entran en
      // warn para no bloquear CI; se arreglan al tocar cada archivo.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/purity': 'warn',
      'react-hooks/static-components': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/immutability': 'warn',
      '@next/next/no-img-element': 'warn',
      'no-use-before-define': [
        'warn',
        { functions: false, classes: true, variables: true, allowNamedExports: false },
      ],
      'max-lines': ['error', { max: 800, skipBlankLines: true, skipComments: true }],
      'no-restricted-syntax': ['error', ...formFieldFontSizeRules],
    },
  },
  {
    files: ['src/__tests__/**/*', '**/*.test.{ts,tsx}', 'src/lib/logger.ts'],
    rules: { 'no-console': 'off', 'max-lines': 'off' },
  },
  {
    files: ['src/scripts/**/*'],
    rules: { 'max-lines': 'off' },
  },
  {
    files: ['src/scripts/**/*.mjs'],
    rules: { 'no-console': 'off', 'max-lines': 'off' },
  },
  {
    files: ['src/golf/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react/*', 'next', 'next/*'],
              message: 'src/golf/ debe ser TypeScript puro sin dependencias React/Next. Ver docs/ADRs/ADR-004.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/components/coach/**/*.{ts,tsx}', 'src/app/coach/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...[
          "Property[key.name='fontSize'] :matches(Literal, TemplateLiteral)",
          "JSXAttribute[name.name=/^font-?[sS]ize$/]",
          "Literal[value=/font-size:\\s*\\d|\\btext-\\[\\d/]",
          "TemplateElement[value.raw=/font-size:\\s*\\d|\\btext-\\[\\d/]",
        ].map((selector) => ({
          selector,
          message: 'Font sizes come from the scale: FONT_SIZE (@/lib/font-size) or var(--fs-*), never a literal. DESIGN.md §4.',
        })),
        ...formFieldFontSizeRules,
      ],
    },
  },
  {
    files: archivosSobreLimite,
    rules: { 'max-lines': 'off' },
  },
]
