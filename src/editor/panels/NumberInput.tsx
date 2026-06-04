import { useState } from 'react'
import './panels.css'

/**
 * Number field with a local text buffer so partial input (e.g. "1.") is
 * editable, while still syncing from the source value when not focused — which
 * is how live gizmo drags get reflected back into the inspector.
 */
export function NumberInput({
  value,
  step,
  onChange,
}: {
  value: number
  step?: number
  onChange: (n: number) => void
}) {
  const [text, setText] = useState(() => format(value))
  const [focused, setFocused] = useState(false)

  // Sync from the source value when it changes externally (e.g. a live gizmo
  // drag) while this field isn't being edited. Adjusting state during render is
  // React's recommended alternative to a value-watching effect.
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    if (!focused) setText(format(value))
  }

  return (
    <input
      className="vec__input"
      type="number"
      step={step}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false)
        setText(format(value))
      }}
      onChange={(e) => {
        setText(e.target.value)
        const n = parseFloat(e.target.value)
        if (!Number.isNaN(n)) onChange(n)
      }}
    />
  )
}

const format = (n: number) => String(Math.round(n * 1000) / 1000)
