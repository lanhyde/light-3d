import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { LightDoc, MaterialDoc, NodeDoc, PrimitiveDoc, SceneDoc } from './sceneTypes'

/**
 * Resolves a glTF asset id to its self-contained .glb bytes. The editor backs
 * this with its in-memory asset store; the exported viewer backs it with bytes
 * fetched from the bundle's `assets/` folder.
 */
export type AssetResolver = (assetId: string) => ArrayBuffer | Promise<ArrayBuffer>

/**
 * Build live THREE objects from a {@link SceneDoc}. Pure runtime logic with no
 * editor dependencies, so the same code rebuilds scenes in the editor and in
 * exported web bundles. Returns the top-level roots; the caller adds them to a
 * scene.
 */
export async function buildScene(doc: SceneDoc, resolveAsset: AssetResolver): Promise<THREE.Object3D[]> {
  const roots: THREE.Object3D[] = []
  for (const node of doc.nodes) roots.push(await buildNode(node, resolveAsset))
  return roots
}

const gltfLoader = new GLTFLoader()

async function buildNode(node: NodeDoc, resolveAsset: AssetResolver): Promise<THREE.Object3D> {
  let obj: THREE.Object3D

  if (node.gltf) {
    obj = await instantiateGltf(node.gltf.assetId, resolveAsset)
  } else if (node.primitive) {
    obj = new THREE.Mesh(buildGeometry(node.primitive.geometry), buildMaterial(node.primitive.material))
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
    for (const child of node.children) obj.add(await buildNode(child, resolveAsset))
  }
  return obj
}

/** Parse a registered asset's glb bytes and tag the root so it round-trips on re-save. */
async function instantiateGltf(assetId: string, resolveAsset: AssetResolver): Promise<THREE.Object3D> {
  const bytes = await resolveAsset(assetId)
  const gltf = await gltfLoader.parseAsync(bytes, '')
  gltf.scene.userData.assetKind = 'gltf'
  gltf.scene.userData.assetId = assetId
  if (gltf.animations.length > 0) gltf.scene.userData.animations = gltf.animations
  return gltf.scene
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
