import { EditorLayout } from './layout/EditorLayout'
import { Viewport } from './viewport/Viewport'

/**
 * Editor root. For now it wires placeholder panels around the live viewport;
 * the hierarchy tree and the property inspector get real behaviour in the
 * next increment.
 */
export default function App() {
  return (
    <EditorLayout
      toolbar={<strong style={{ color: '#e8e8ee' }}>light-3d</strong>}
      left={
        <>
          <h2 className="panel__title">Hierarchy</h2>
          <p className="panel__placeholder">Scene tree coming next…</p>
        </>
      }
      right={
        <>
          <h2 className="panel__title">Inspector</h2>
          <p className="panel__placeholder">Select an object…</p>
        </>
      }
      center={<Viewport />}
    />
  )
}
