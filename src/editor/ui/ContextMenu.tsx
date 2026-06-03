import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import './ContextMenu.css'

export interface MenuItem {
  /** Display text. Omit when `separator` is set. */
  label?: string
  onClick?: () => void
  disabled?: boolean
  separator?: boolean
}

interface MenuState {
  x: number
  y: number
  items: MenuItem[]
}

interface ContextMenuApi {
  openMenu: (x: number, y: number, items: MenuItem[]) => void
}

const ContextMenuContext = createContext<ContextMenuApi | null>(null)

/** Provides a single floating menu, opened imperatively via {@link useContextMenu}. */
export function ContextMenuProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const close = useCallback(() => setMenu(null), [])
  const openMenu = useCallback(
    (x: number, y: number, items: MenuItem[]) => setMenu({ x, y, items }),
    [],
  )

  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu, close])

  return (
    <ContextMenuContext.Provider value={{ openMenu }}>
      {children}
      {menu && (
        <div
          className="ctx-backdrop"
          onPointerDown={close}
          onContextMenu={(e) => {
            e.preventDefault()
            close()
          }}
        >
          <ul
            className="ctx-menu"
            style={clampPosition(menu.x, menu.y, menu.items.length)}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {menu.items.map((item, i) =>
              item.separator ? (
                <li key={i} className="ctx-menu__sep" />
              ) : (
                <li
                  key={i}
                  className={`ctx-menu__item${item.disabled ? ' ctx-menu__item--disabled' : ''}`}
                  onClick={() => {
                    if (item.disabled) return
                    item.onClick?.()
                    close()
                  }}
                >
                  {item.label}
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </ContextMenuContext.Provider>
  )
}

export function useContextMenu(): ContextMenuApi {
  const ctx = useContext(ContextMenuContext)
  if (!ctx) throw new Error('useContextMenu must be used within a ContextMenuProvider')
  return ctx
}

/** Keep the menu inside the viewport (rough estimate of its footprint). */
function clampPosition(x: number, y: number, itemCount: number) {
  const width = 190
  const height = itemCount * 28 + 8
  return {
    left: Math.min(x, window.innerWidth - width - 4),
    top: Math.min(y, window.innerHeight - height - 4),
  }
}
