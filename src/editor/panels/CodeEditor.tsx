import './panels.css'

/** A plain code textarea with an optional error line beneath it. */
export function CodeEditor({
  value,
  onChange,
  error,
  rows = 16,
}: {
  value: string
  onChange: (text: string) => void
  error?: string | null
  rows?: number
}) {
  return (
    <div className="code-editor">
      <textarea
        className="code-editor__area"
        spellCheck={false}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error && <p className="code-editor__error">⚠ {error}</p>}
    </div>
  )
}
