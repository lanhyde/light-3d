import * as THREE from 'three'
import {
  allAssets,
  base64ToBytes,
  bytesToBase64,
  clearAssets,
  getAsset,
  putAsset,
} from '../assets/assetStore'
import { buildScene } from '../../runtime/sceneLoader'
import type { AssetDoc, LightDoc, NodeDoc, PrimitiveDoc, SceneDoc } from '../../runtime/sceneTypes'
import { SCENE_DOC_VERSION } from '../../runtime/sceneTypes'
import { clearSceneContent } from './operations'

export type { SceneDoc } from '../../runtime/sceneTypes'

// --- Serialize -------------------------------------------------------------

export function serializeScene(scene: THREE.Scene): SceneDoc {
  const usedAssets = new Set<string>()
  const nodes = scene.children
    .filter((o) => !o.userData.editorOnly)
    .map((o) => serializeNode(o, usedAssets))

  const assets: AssetDoc[] = allAssets()
    .filter((a) => usedAssets.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, data: bytesToBase64(a.bytes) }))

  return { version: SCENE_DOC_VERSION, assets, nodes }
}

function serializeNode(obj: THREE.Object3D, usedAssets: Set<string>): NodeDoc {
  const node: NodeDoc = {
    name: obj.name,
    visible: obj.visible,
    position: obj.position.toArray(),
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: obj.scale.toArray(),
  }

  if (obj.userData.assetKind === 'gltf') {
    usedAssets.add(obj.userData.assetId)
    node.gltf = { assetId: obj.userData.assetId }
    return node // glTF subtree is referenced by id, not walked
  }

  const children = obj.children.filter((o) => !o.userData.editorOnly)

  if ((obj as THREE.Mesh).isMesh) {
    node.primitive = serializePrimitive(obj as THREE.Mesh)
  } else if ((obj as THREE.Light).isLight) {
    node.light = serializeLight(obj as THREE.Light)
  }

  if (children.length > 0) node.children = children.map((c) => serializeNode(c, usedAssets))
  return node
}

function serializePrimitive(mesh: THREE.Mesh): PrimitiveDoc {
  const geometry = mesh.geometry as THREE.BufferGeometry & { parameters?: Record<string, number> }
  const mat = (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) as THREE.MeshStandardMaterial
  return {
    geometry: { type: geometry.type, parameters: geometry.parameters ?? {} },
    material: {
      color: mat.color?.getHex() ?? 0xffffff,
      roughness: mat.roughness ?? 1,
      metalness: mat.metalness ?? 0,
      opacity: mat.opacity ?? 1,
      transparent: mat.transparent ?? false,
      side: mat.side ?? THREE.FrontSide,
    },
  }
}

function serializeLight(light: THREE.Light): LightDoc {
  const doc: LightDoc = {
    type: light.type as LightDoc['type'],
    color: light.color.getHex(),
    intensity: light.intensity,
  }
  if (light instanceof THREE.PointLight) {
    doc.distance = light.distance
    doc.decay = light.decay
  }
  return doc
}

// --- Deserialize -----------------------------------------------------------

export async function applySceneDoc(scene: THREE.Scene, doc: SceneDoc): Promise<void> {
  clearSceneContent()
  clearAssets()

  for (const a of doc.assets) {
    putAsset({ id: a.id, name: a.name, mimeType: a.mimeType, bytes: base64ToBytes(a.data ?? '') })
  }

  // Shared loader, backed by the editor's asset store.
  const resolveAsset = (id: string): ArrayBuffer => {
    const asset = getAsset(id)
    if (!asset) throw new Error(`Asset not found: ${id}`)
    return asset.bytes
  }
  for (const root of await buildScene(doc, resolveAsset)) scene.add(root)
}
