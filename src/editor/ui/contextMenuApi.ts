import { createContext, useContext } from 'react'

export interface MenuItem {
  /** Display text. Omit when `separator` is set. */
  label?: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
}

export interface ContextMenuApi {
  openMenu: (x: number, y: number, items: MenuItem[]) => void
}

export const ContextMenuContext = createContext<ContextMenuApi | null>(null)

export function useContextMenu(): ContextMenuApi {
  const ctx = useContext(ContextMenuContext)
  if (!ctx) throw new Error('useContextMenu must be used within a ContextMenuProvider')
  return ctx
}
