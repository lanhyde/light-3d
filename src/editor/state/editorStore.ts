import { create } from 'zustand'
import type { Engine } from '../../engine'

export type TransformMode = 'translate' | 'rotate' | 'scale'

interface EditorState {
  /** The live engine instance, owned by the Viewport and shared with panels. */
  engine: Engine | null
  /**
   * UUIDs of the currently selected objects, in selection order. The last entry
   * is the "active" object — the one the gizmo and inspector operate on.
   */
  selectedUuids: string[]
  /**
   * Monotonic counter bumped whenever the scene graph or a transform mutates.
   * React panels subscribe to it to re-read the (mutable) Three.js scene — we
   * deliberately keep Object3D instances out of the store.
   */
  sceneRevision: number
  /** Counter bumped whenever the project asset registry changes. */
  assetRevision: number
  /** Active gizmo mode. */
  transformMode: TransformMode
  /** Whether behaviors are running (Play mode). Transforms restore on Stop. */
  isPlaying: boolean

  setEngine: (engine: Engine | null) => void
  /** Select a single object, or toggle it when `additive` (Ctrl/Cmd). null clears. */
  select: (uuid: string | null, additive?: boolean) => void
  setSelection: (uuids: string[]) => void
  bumpScene: () => void
  bumpAssets: () => void
  setTransformMode: (mode: TransformMode) => void
  setPlaying: (playing: boolean) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  engine: null,
  selectedUuids: [],
  sceneRevision: 0,
  assetRevision: 0,
  transformMode: 'translate',
  isPlaying: false,

  setEngine: (engine) => set({ engine, selectedUuids: [] }),
  select: (uuid, additive = false) =>
    set((s) => {
      if (uuid === null) return { selectedUuids: [] }
      if (!additive) return { selectedUuids: [uuid] }
      return s.selectedUuids.includes(uuid)
        ? { selectedUuids: s.selectedUuids.filter((id) => id !== uuid) }
        : { selectedUuids: [...s.selectedUuids, uuid] }
    }),
  setSelection: (selectedUuids) => set({ selectedUuids }),
  bumpScene: () => set((s) => ({ sceneRevision: s.sceneRevision + 1 })),
  bumpAssets: () => set((s) => ({ assetRevision: s.assetRevision + 1 })),
  setTransformMode: (transformMode) => set({ transformMode }),
  setPlaying: (isPlaying) => set({ isPlaying }),
}))

/** The active object's UUID (last selected), or null. */
export const activeUuid = (uuids: string[]): string | null =>
  uuids.length > 0 ? uuids[uuids.length - 1] : null
