import { useState } from 'react'
import type { AssetKind } from '../../runtime/sceneTypes'
import { DEFAULT_SCRIPT, validateScript } from '../../runtime/behaviors'
import {
  assetsOfKind,
  createTextAsset,
  getAsset,
  removeAsset,
  renameAsset,
  updateAssetText,
  type Asset,
} from '../assets/assetStore'
import { useEditorStore } from '../state/editorStore'
import { CodeEditor } from './CodeEditor'
import './panels.css'

const DEFAULT_SHADER = `// Fragment shader (stub — not yet wired to materials).
precision highp float;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vUv, 0.5, 1.0);
}
`

const DEFAULT_ANIMATION = `{
  "name": "NewAnimation",
  "duration": 1,
  "tracks": []
}
`

const NEW_TEMPLATES: Record<Exclude<AssetKind, 'model'>, { name: string; text: string }> = {
  script: { name: 'NewScript', text: DEFAULT_SCRIPT },
  shader: { name: 'NewShader', text: DEFAULT_SHADER },
  animation: { name: 'NewAnimation', text: DEFAULT_ANIMATION },
}

const GROUPS: { kind: AssetKind; label: string; badge: string }[] = [
  { kind: 'script', label: 'Scripts', badge: 'JS' },
  { kind: 'shader', label: 'Shaders', badge: 'GLSL' },
  { kind: 'animation', label: 'Animations', badge: 'ANIM' },
  { kind: 'model', label: 'Models', badge: 'GLB' },
]

const BADGE: Record<AssetKind, string> = { script: 'JS', shader: 'GLSL', animation: 'ANIM', model: 'GLB' }

/**
 * The Project window (Unity-style): manages all user-authored assets — scripts,
 * shaders, animations — plus imported models, each handled as a file. Selecting
 * a text asset opens it in an editor; behaviors reference these by id.
 */
export function Project() {
  const bumpAssets = useEditorStore((s) => s.bumpAssets)
  useEditorStore((s) => s.assetRevision) // re-read the registry on every change
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const selected = selectedId ? getAsset(selectedId) : null
  const isEmpty = GROUPS.every((g) => assetsOfKind(g.kind).length === 0)

  const create = (kind: Exclude<AssetKind, 'model'>) => {
    const t = NEW_TEMPLATES[kind]
    const id = createTextAsset(kind, t.name, t.text)
    bumpAssets()
    setSelectedId(id)
  }

  return (
    <div className="project">
      <div className="project__list">
        <div className="project__bar">
          <span className="panel__title-inline">Project</span>
          <select
            className="project__new"
            value=""
            onChange={(e) => {
              if (e.target.value) create(e.target.value as Exclude<AssetKind, 'model'>)
            }}
          >
            <option value="">+ New…</option>
            <option value="script">Script</option>
            <option value="shader">Shader</option>
            <option value="animation">Animation</option>
          </select>
        </div>

        {isEmpty && <p className="behaviors__empty">No assets yet. Create one with “+ New”.</p>}

        {GROUPS.map(({ kind, label }) => {
          const items = assetsOfKind(kind)
          if (items.length === 0) return null
          return (
            <div key={kind} className="project__group">
              <div className="project__group-title">{label}</div>
              {items.map((a) => (
                <div
                  key={a.id}
                  className={'project__item' + (a.id === selectedId ? ' project__item--selected' : '')}
                  onClick={() => setSelectedId(a.id)}
                >
                  <span className="project__badge">{BADGE[a.kind]}</span>
                  <span className="project__name">{a.name}</span>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      <div className="project__detail">
        {selected ? (
          <AssetDetail
            asset={selected}
            onChange={bumpAssets}
            onDelete={() => {
              removeAsset(selected.id)
              bumpAssets()
              setSelectedId(null)
            }}
          />
        ) : (
          <p className="panel__placeholder">Select an asset to edit…</p>
        )}
      </div>
    </div>
  )
}

function AssetDetail({
  asset,
  onChange,
  onDelete,
}: {
  asset: Asset
  onChange: () => void
  onDelete: () => void
}) {
  const isText = asset.kind !== 'model'
  return (
    <div className="asset-detail">
      <div className="asset-detail__head">
        <span className="project__badge">{BADGE[asset.kind]}</span>
        <input
          className="field__text"
          value={asset.name}
          onChange={(e) => {
            renameAsset(asset.id, e.target.value)
            onChange()
          }}
        />
        <button className="behavior__remove" title="Delete asset" onClick={onDelete}>
          ×
        </button>
      </div>
      {isText ? (
        <CodeEditor
          value={asset.text ?? ''}
          error={asset.kind === 'script' ? validateScript(asset.text ?? '') : null}
          onChange={(text) => {
            updateAssetText(asset.id, text)
            onChange()
          }}
        />
      ) : (
        <p className="behaviors__empty">
          {(asset.bytes?.byteLength ?? 0).toLocaleString()} bytes · {asset.mimeType}
        </p>
      )}
    </div>
  )
}
