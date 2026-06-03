import * as THREE from 'three'
import {
  allAssets,
  base64ToBytes,
  bytesToBase64,
  clearAssets,
  putAsset,
} from '../assets/assetStore'
import { instantiateGltfAsset } from '../assets/gltf'
import { clearSceneContent } from './operations'

/**
 * Custom scene document format. Chosen over THREE's `toJSON()` so that:
 *  - primitives are stored compactly as geometry params + material,
 *  - imported glTF models are stored as *asset references* (not baked vertices),
 *  - the document maps cleanly onto the future entity/component model and the
 *    export pipeline.
 */
export interface SceneDoc {
  version: 1
  assets: AssetDoc[]
  nodes: NodeDoc[]
}

interface AssetDoc {
  id: string
  name: string
  mimeType: string
  data: string // base64
}

interface NodeDoc {
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

interface PrimitiveDoc {
  geometry: { type: string; parameters: Record<string, number> }
  material: MaterialDoc
}

interface MaterialDoc {
  color: number
  roughness: number
  metalness: number
  opacity: number
  transparent: boolean
  side: THREE.Side
}

interface LightDoc {
  type: 'AmbientLight' | 'DirectionalLight' | 'PointLight'
  color: number
  intensity: number
  distance?: number
  decay?: number
}

const VERSION = 1

// --- Serialize -------------------------------------------------------------

export function serializeScene(scene: THREE.Scene): SceneDoc {
  const usedAssets = new Set<string>()
  const nodes = scene.children
    .filter((o) => !o.userData.editorOnly)
    .map((o) => serializeNode(o, usedAssets))

  const assets: AssetDoc[] = allAssets()
    .filter((a) => usedAssets.has(a.id))
    .map((a) => ({ id: a.id, name: a.name, mimeType: a.mimeType, data: bytesToBase64(a.bytes) }))

  return { version: VERSION, assets, nodes }
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
    putAsset({ id: a.id, name: a.name, mimeType: a.mimeType, bytes: base64ToBytes(a.data) })
  }

  for (const node of doc.nodes) {
    scene.add(await buildNode(node))
  }
}

async function buildNode(node: NodeDoc): Promise<THREE.Object3D> {
  let obj: THREE.Object3D

  if (node.gltf) {
    obj = await instantiateGltfAsset(node.gltf.assetId)
  } else if (node.primitive) {
    obj = new THREE.Mesh(
      buildGeometry(node.primitive.geometry),
      buildMaterial(node.primitive.material),
    )
  } else if (node.light) {
    obj = buildLight(node.light)
  } else {
    obj = new THREE.Group()
  }

  obj.name = node.name
  obj.visible = node.visible
  obj.position.fromArray(node.position)
  obj.rotation.set(node.rotation[0], node.rotation[1], node.rotation[2])
  obj.scale.fromArray(node.scale)

  if (node.children && !node.gltf) {
    for (const child of node.children) obj.add(await buildNode(child))
  }
  return obj
}

function buildGeometry({ type, parameters: p }: PrimitiveDoc['geometry']): THREE.BufferGeometry {
  switch (type) {
    case 'BoxGeometry':
      return new THREE.BoxGeometry(p.width, p.height, p.depth, p.widthSegments, p.heightSegments, p.depthSegments)
    case 'SphereGeometry':
      return new THREE.SphereGeometry(p.radius, p.widthSegments, p.heightSegments, p.phiStart, p.phiLength, p.thetaStart, p.thetaLength)
    case 'CylinderGeometry':
      return new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments, p.heightSegments, undefined, p.thetaStart, p.thetaLength)
    case 'PlaneGeometry':
      return new THREE.PlaneGeometry(p.width, p.height, p.widthSegments, p.heightSegments)
    default:
      console.warn(`Unknown geometry "${type}", falling back to a unit box`)
      return new THREE.BoxGeometry(1, 1, 1)
  }
}

function buildMaterial(m: MaterialDoc): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: m.color,
    roughness: m.roughness,
    metalness: m.metalness,
    opacity: m.opacity,
    transparent: m.transparent,
    side: m.side,
  })
}

function buildLight(l: LightDoc): THREE.Light {
  switch (l.type) {
    case 'AmbientLight':
      return new THREE.AmbientLight(l.color, l.intensity)
    case 'DirectionalLight':
      return new THREE.DirectionalLight(l.color, l.intensity)
    case 'PointLight':
      return new THREE.PointLight(l.color, l.intensity, l.distance, l.decay)
  }
}
