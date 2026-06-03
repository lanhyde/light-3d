import { useRef } from 'react'
import type { TransformMode } from '../state/editorStore'
import { useEditorStore } from '../state/editorStore'
import { createMenuItems } from '../scene/factories'
import { importGltfFiles, loadSceneFromFile, saveSceneToFile } from '../scene/io'
import { useContextMenu } from '../ui/ContextMenu'
import './panels.css'

const MODES: { mode: TransformMode; label: string; key: string }[] = [
  { mode: 'translate', label: 'Move', key: 'W' },
  { mode: 'rotate', label: 'Rotate', key: 'E' },
  { mode: 'scale', label: 'Scale', key: 'R' },
]

export function Toolbar() {
  const transformMode = useEditorStore((s) => s.transformMode)
  const setTransformMode = useEditorStore((s) => s.setTransformMode)
  const { openMenu } = useContextMenu()

  const gltfInput = useRef<HTMLInputElement>(null)
  const sceneInput = useRef<HTMLInputElement>(null)

  const openAddMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    openMenu(rect.left, rect.bottom + 2, createMenuItems())
  }

  return (
    <>
      <strong className="toolbar__brand">light-3d</strong>

      <div className="toolbar__group">
        <button className="toolbar__btn" onClick={() => sceneInput.current?.click()}>
          Open
        </button>
        <button className="toolbar__btn" onClick={saveSceneToFile}>
          Save
        </button>
        <button
          className="toolbar__btn"
          onClick={() => gltfInput.current?.click()}
          title="Import .glb, or a .gltf together with its .bin and texture files"
        >
          Import
        </button>
      </div>

      <button className="toolbar__btn toolbar__btn--add" onClick={openAddMenu}>
        + Add ▾
      </button>

      <div className="toolbar__group">
        {MODES.map(({ mode, label, key }) => (
          <button
            key={mode}
            className={`toolbar__btn${transformMode === mode ? ' toolbar__btn--active' : ''}`}
            onClick={() => setTransformMode(mode)}
            title={`${label} (${key})`}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        ref={gltfInput}
        type="file"
        accept=".glb,.gltf,.bin,image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files ? Array.from(e.target.files) : []
          if (files.length > 0)
            void importGltfFiles(files).catch((err) => console.error('glTF import failed:', err))
          e.target.value = ''
        }}
      />
      <input
        ref={sceneInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void loadSceneFromFile(file).catch((err) => console.error('Scene load failed:', err))
          e.target.value = ''
        }}
      />
    </>
  )
}
