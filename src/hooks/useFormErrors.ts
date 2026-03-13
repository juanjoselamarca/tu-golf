'use client'

import { useCallback, useState } from 'react'

export function useFormErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setFieldError = useCallback((field: string, message: string) => {
    setErrors((prev) => ({ ...prev, [field]: message }))
  }, [])

  const clearFieldError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const clearAll = useCallback(() => setErrors({}), [])

  const fieldError = useCallback(
    (field: string): string | null => errors[field] ?? null,
    [errors]
  )

  const hasErrors = useCallback(() => Object.keys(errors).length > 0, [errors])

  return { fieldError, setFieldError, clearFieldError, clearAll, hasErrors }
}
