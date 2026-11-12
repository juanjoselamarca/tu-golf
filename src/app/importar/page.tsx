'use client'

import { Suspense } from 'react'
import ImportWizard from '@/components/import/ImportWizard'
import { BrandedLoading } from '@/components/ronda/BrandedLoading'

function ImportarContent() {
  return <ImportWizard />
}

export default function ImportarPage() {
  return (
    <Suspense fallback={<BrandedLoading message="Cargando importador" />}>
      <ImportarContent />
    </Suspense>
  )
}
