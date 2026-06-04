import type * as THREE from 'three'

/**
 * Custom scene document format, shared by the editor (save/load) and the
 * exported runtime viewer. Chosen over THREE's `toJSON()` so that:
 *  - primitives are stored compactly as geometry params + material,
 *  - imported glTF models are stored as *asset references* (not baked vertices),
 *  - the document maps cleanly onto the future entity/component model.
 *
 * In a saved `.json` scene, assets are embedded inline as base64 (`data`). In an
 * exported web bundle, assets are written as separate files and `data` is
 * omitted (each `<id>` resolves to `assets/<id>.glb`).
 */
export interface SceneDoc {
  version: 1
  assets: AssetDoc[]
  nodes: NodeDoc[]
}

/** The kinds of project asset the editor manages (the Project window groups by this). */
export type AssetKind = 'model' | 'script' | 'shader' | 'animation'

export interface AssetDoc {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  /** base64 payload for binary assets (model). Omitted in exported bundles. */
  data?: string
  /** source text for text assets (script/shader/animation), stored inline. */
  text?: string
}

export interface NodeDoc {
  name: string
  visible: boolean
  position: [number, number, number]
  rotation: [number, number, number] // euler radians
  scale: [number, number, number]
  children?: NodeDoc[]
  /** Attached behaviors (Unity-style components) that drive runtime behavior. */
  behaviors?: BehaviorDoc[]
  // Exactly one of the following describes what the node *is*:
  primitive?: PrimitiveDoc
  light?: LightDoc
  gltf?: { assetId: string }
}

/** A behavior attached to a node: a registered `type` plus its configured props. */
export interface BehaviorDoc {
  type: string
  props: Record<string, number | string | boolean>
}

export interface PrimitiveDoc {
  geometry: { type: string; parameters: Record<string, number> }
  material: MaterialDoc
}

export interface MaterialDoc {
  color: number
  roughness: number
  metalness: number
  opacity: number
  transparent: boolean
  side: THREE.Side
}

export interface LightDoc {
  type: 'AmbientLight' | 'DirectionalLight' | 'PointLight'
  color: number
  intensity: number
  distance?: number
  decay?: number
}

export const SCENE_DOC_VERSION = 1
