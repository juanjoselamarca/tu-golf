import { useState, useCallback, useRef } from 'react'

export interface ConfirmOptions {
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning'
}

/**
 * Hook para usar ConfirmModal de forma imperativa (reemplaza `window.confirm`).
 *
 * Uso:
 *   const { confirm, modalProps } = useConfirmModal()
 *   const ok = await confirm({ title: '...', description: '...' })
 *   if (!ok) return
 *   // ... acción
 *   <ConfirmModal {...modalProps} />
 */
export function useConfirmModal() {
  const [isOpen, setIsOpen] = useState(false)
  const [options, setOptions] = useState<ConfirmOptions>({
    title: '',
    description: '',
  })
  const resolveRef = useRef<((value: boolean) => void) | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    setOptions(opts)
    setIsOpen(true)
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve
    })
  }, [])

  const onConfirm = useCallback(() => {
    setIsOpen(false)
    resolveRef.current?.(true)
    resolveRef.current = null
  }, [])

  const onCancel = useCallback(() => {
    setIsOpen(false)
    resolveRef.current?.(false)
    resolveRef.current = null
  }, [])

  return {
    confirm,
    modalProps: {
      isOpen,
      onConfirm,
      onCancel,
      ...options,
    },
  }
}
