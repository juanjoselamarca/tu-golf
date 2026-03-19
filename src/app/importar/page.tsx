'use client'

import { Suspense } from 'react'
import ImportWizard from '@/components/import/ImportWizard'

function ImportarContent() {
  return <ImportWizard />
}

export default function ImportarPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#94a8c0',
          }}
        >
          Cargando importador...
        </div>
      }
    >
      <ImportarContent />
    </Suspense>
  )
}
