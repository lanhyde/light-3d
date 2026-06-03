import { EditorLayout } from './layout/EditorLayout'
import { Viewport } from './viewport/Viewport'
import { Hierarchy } from './panels/Hierarchy'
import { Inspector } from './panels/Inspector'
import { Toolbar } from './panels/Toolbar'
import { ContextMenuProvider } from './ui/ContextMenu'

/**
 * Editor root. Panels and the viewport share state through the Zustand store,
 * so no React context is needed for that — the engine instance, selection and
 * gizmo mode all live there. The context-menu provider is the one piece of
 * shared UI state that does use React context.
 */
export default function App() {
  return (
    <ContextMenuProvider>
      <EditorLayout
        toolbar={<Toolbar />}
        left={
          <>
            <h2 className="panel__title">Hierarchy</h2>
            <Hierarchy />
          </>
        }
        right={
          <>
            <h2 className="panel__title">Inspector</h2>
            <Inspector />
          </>
        }
        center={<Viewport />}
      />
    </ContextMenuProvider>
  )
}
