import type * as THREE from 'three'
import { BEHAVIOR_DEFS, behaviorDefinitions, defaultBehaviorProps } from '../../runtime/behaviors'
import type { PropSpec, PropValue } from '../../runtime/behaviors'
import type { BehaviorDoc } from '../../runtime/sceneTypes'
import { assetsOfKind } from '../assets/assetStore'
import { NumberInput } from './NumberInput'

/**
 * Inspector section for attaching/configuring behaviors on the active object.
 * Behaviors are stored on `object.userData.behaviors` and run in Play mode (and
 * always in exported bundles); editing here just updates that data.
 */
export function BehaviorsSection({
  obj,
  mutate,
}: {
  obj: THREE.Object3D
  mutate: (fn: (o: THREE.Object3D) => void) => void
}) {
  const behaviors = (obj.userData.behaviors as BehaviorDoc[] | undefined) ?? []

  const updateList = (fn: (list: BehaviorDoc[]) => BehaviorDoc[]) =>
    mutate((o) => {
      o.userData.behaviors = fn((o.userData.behaviors as BehaviorDoc[] | undefined) ?? [])
    })

  return (
    <div className="behaviors">
      <div className="behaviors__head">
        <span className="field__label">Behaviors</span>
        <select
          className="behaviors__add"
          value=""
          onChange={(e) => {
            if (e.target.value) updateList((l) => [...l, { type: e.target.value, props: defaultBehaviorProps(e.target.value) }])
          }}
        >
          <option value="">+ Add…</option>
          {behaviorDefinitions().map((def) => (
            <option key={def.type} value={def.type}>
              {def.label}
            </option>
          ))}
        </select>
      </div>

      {behaviors.length === 0 && (
        <p className="behaviors__empty">None. Add one, then press ▶ Play.</p>
      )}

      {behaviors.map((b, i) => {
        const def = BEHAVIOR_DEFS[b.type]
        return (
          <div className="behavior" key={i}>
            <div className="behavior__head">
              <strong>{def?.label ?? b.type}</strong>
              <button
                className="behavior__remove"
                title="Remove behavior"
                onClick={() => updateList((l) => l.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </div>
            {def ? (
              def.props.map((spec) => {
                const value = b.props[spec.key] ?? spec.default
                const onChange = (v: PropValue) =>
                  updateList((l) =>
                    l.map((item, idx) =>
                      idx === i ? { ...item, props: { ...item.props, [spec.key]: v } } : item,
                    ),
                  )
                return <PropRow key={spec.key} spec={spec} value={value} onChange={onChange} />
              })
            ) : (
              <p className="behaviors__empty">Unknown behavior type.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PropRow({
  spec,
  value,
  onChange,
}: {
  spec: PropSpec
  value: PropValue
  onChange: (v: PropValue) => void
}) {
  return (
    <label className="field field--inline behavior__prop">
      <span className="field__label">{spec.label}</span>
      {spec.type === 'number' && (
        <span className="behavior__num">
          <NumberInput value={Number(value)} step={spec.step} onChange={(n) => onChange(n)} />
        </span>
      )}
      {spec.type === 'axis' && (
        <select
          className="behavior__select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          {(['x', 'y', 'z'] as const).map((a) => (
            <option key={a} value={a}>
              {a.toUpperCase()}
            </option>
          ))}
        </select>
      )}
      {spec.type === 'text' && (
        <input
          className="behavior__text"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {spec.type === 'asset' && (
        <select
          className="behavior__select"
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">— none —</option>
          {assetsOfKind(spec.assetKind ?? 'script').map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      )}
      {spec.type === 'boolean' && (
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
      )}
    </label>
  )
}
