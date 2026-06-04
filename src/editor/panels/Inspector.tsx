import * as THREE from 'three'
import { activeUuid, useEditorStore } from '../state/editorStore'
import { NumberInput } from './NumberInput'
import { BehaviorsSection } from './Behaviors'
import './panels.css'

/**
 * Edits the transform and basic properties of the active object (the last one
 * selected). It reads and writes the mutable Three.js object directly, bumping
 * `sceneRevision` after each change so the rest of the editor stays in sync
 * (and so gizmo drags flow back into these fields).
 */
export function Inspector() {
  const engine = useEditorStore((s) => s.engine)
  const selectedUuids = useEditorStore((s) => s.selectedUuids)
  const bumpScene = useEditorStore((s) => s.bumpScene)
  useEditorStore((s) => s.sceneRevision) // re-read on every mutation
  useEditorStore((s) => s.assetRevision) // refresh asset references (e.g. script list)

  const active = activeUuid(selectedUuids)
  const obj = engine && active ? engine.scene.getObjectByProperty('uuid', active) : null

  if (!obj) return <p className="panel__placeholder">Select an object…</p>

  // Mutate the live object by re-resolving it inside the handler, so we never
  // write back to the same value we read during render (which the immutability
  // lint forbids). `bumpScene` then propagates the change.
  const mutate = (fn: (o: THREE.Object3D) => void) => {
    const target = engine?.scene.getObjectByProperty('uuid', active ?? '')
    if (!target) return
    fn(target)
    bumpScene()
  }

  return (
    <div className="inspector">
      {selectedUuids.length > 1 && (
        <p className="inspector__multi">
          {selectedUuids.length} selected · editing <strong>{obj.name || obj.type}</strong>
        </p>
      )}
      <label className="field">
        <span className="field__label">Name</span>
        <input
          className="field__text"
          value={obj.name}
          onChange={(e) => mutate((o) => (o.name = e.target.value))}
        />
      </label>

      <label className="field field--inline">
        <span className="field__label">Visible</span>
        <input
          type="checkbox"
          checked={obj.visible}
          onChange={(e) => mutate((o) => (o.visible = e.target.checked))}
        />
      </label>

      <VectorRow label="Position" vec={obj.position} step={0.1} onChange={bumpScene} />
      <EulerRow label="Rotation" euler={obj.rotation} onChange={bumpScene} />
      <VectorRow label="Scale" vec={obj.scale} step={0.1} onChange={bumpScene} />

      <BehaviorsSection obj={obj} mutate={mutate} />
    </div>
  )
}

function VectorRow({
  label,
  vec,
  step,
  onChange,
}: {
  label: string
  vec: THREE.Vector3
  step: number
  onChange: () => void
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="vec">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberInput
            key={axis}
            value={vec[axis]}
            step={step}
            onChange={(n) => {
              vec[axis] = n
              onChange()
            }}
          />
        ))}
      </div>
    </div>
  )
}

function EulerRow({
  label,
  euler,
  onChange,
}: {
  label: string
  euler: THREE.Euler
  onChange: () => void
}) {
  return (
    <div className="field">
      <span className="field__label">{label}</span>
      <div className="vec">
        {(['x', 'y', 'z'] as const).map((axis) => (
          <NumberInput
            key={axis}
            value={THREE.MathUtils.radToDeg(euler[axis])}
            step={1}
            onChange={(deg) => {
              euler[axis] = THREE.MathUtils.degToRad(deg)
              onChange()
            }}
          />
        ))}
      </div>
    </div>
  )
}

