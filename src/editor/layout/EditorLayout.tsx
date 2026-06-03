import type { ReactNode } from 'react'
import './EditorLayout.css'

interface EditorLayoutProps {
  toolbar?: ReactNode
  left?: ReactNode
  center: ReactNode
  right?: ReactNode
}

/**
 * The classic editor chrome: a toolbar across the top and three columns
 * (hierarchy · viewport · inspector). Panels are passed in as props so the
 * layout stays dumb and the wiring lives in {@link App}.
 */
export function EditorLayout({ toolbar, left, center, right }: EditorLayoutProps) {
  return (
    <div className="editor">
      <header className="editor__toolbar">{toolbar}</header>
      <div className="editor__body">
        <aside className="editor__panel editor__panel--left">{left}</aside>
        <main className="editor__viewport">{center}</main>
        <aside className="editor__panel editor__panel--right">{right}</aside>
      </div>
    </div>
  )
}
