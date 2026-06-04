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

export interface AssetDoc {
  id: string
  name: string
  mimeType: string
  /** base64 payload — present in saved scenes, omitted in exported bundles. */
  data?: string
}

export interface NodeDoc {
  name: string
  visible: boolean
  position: [number, number, number]
  rotation: [number, number, number] // euler radians
  scale: [number, number, number]
  children?: NodeDoc[]
  // Exactly one of the following describes what the node *is*:
  primitive?: PrimitiveDoc
  light?: LightDoc
  gltf?: { assetId: string }
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
