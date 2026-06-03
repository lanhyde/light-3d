import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
import { getAsset } from './assetStore'

const defaultLoader = new GLTFLoader()

/** Parse glTF/glb bytes (or text) into a GLTF result using an optional manager. */
function parseGltf(data: ArrayBuffer | string, loader: GLTFLoader): Promise<GLTF> {
  return new Promise((resolve, reject) => loader.parse(data, '', resolve, reject))
}

/** Tag a glТF scene root so the serializer treats it as an asset reference. */
function tagGltfRoot(root: THREE.Object3D, assetId: string, animations: THREE.AnimationClip[]): void {
  root.userData.assetKind = 'gltf'
  root.userData.assetId = assetId
  if (animations.length > 0) root.userData.animations = animations
}

/**
 * Instantiate a previously-registered asset. Assets are always stored as
 * self-contained .glb, so a plain parse with no resource resolution suffices.
 */
export function instantiateGltfAsset(assetId: string): Promise<THREE.Object3D> {
  const asset = getAsset(assetId)
  if (!asset) return Promise.reject(new Error(`Asset not found: ${assetId}`))
  return parseGltf(asset.bytes, defaultLoader).then((gltf) => {
    tagGltfRoot(gltf.scene, assetId, gltf.animations)
    return gltf.scene
  })
}

/**
 * Load a glTF that may reference external files (a `.bin` buffer and image
 * textures), resolving those relative URIs against the provided sibling files.
 *
 * The external `uri`s in the glTF JSON are rewritten to blob URLs *before*
 * parsing, rather than relying on a LoadingManager URL modifier — the modifier
 * reaches the buffer loader but not the image loader, so textures would
 * otherwise 404. Returns the loaded result; the caller registers/tags it.
 */
export async function loadGltfWithResources(main: File, files: File[]): Promise<GLTF> {
  const basename = (p: string) => (p.split(/[\\/]/).pop() ?? p).toLowerCase()

  const fileMap = new Map<string, File>()
  for (const f of files) {
    fileMap.set(basename(f.name), f)
    if (f.webkitRelativePath) fileMap.set(basename(f.webkitRelativePath), f)
  }

  const json = JSON.parse(await main.text())
  const created: string[] = []
  const rewriteUris = (defs: unknown) => {
    if (!Array.isArray(defs)) return
    for (const def of defs as { uri?: string }[]) {
      if (typeof def.uri !== 'string' || /^(data:|blob:|https?:)/i.test(def.uri)) continue
      const file = fileMap.get(basename(decodeURIComponent(def.uri)))
      if (!file) continue
      const url = URL.createObjectURL(file)
      created.push(url)
      def.uri = url
    }
  }
  rewriteUris(json.buffers)
  rewriteUris(json.images)

  try {
    // parse() resolves only after textures finish loading, so the blob URLs
    // are safe to revoke immediately afterwards.
    return await parseGltf(JSON.stringify(json), defaultLoader)
  } finally {
    created.forEach((u) => URL.revokeObjectURL(u))
  }
}

/** Re-export a loaded object tree to a self-contained binary glb (ArrayBuffer). */
export function exportGlb(
  object: THREE.Object3D,
  animations: THREE.AnimationClip[] = [],
): Promise<ArrayBuffer> {
  const exporter = new GLTFExporter()
  return new Promise((resolve, reject) => {
    exporter.parse(
      object,
      (result) => resolve(result as ArrayBuffer),
      reject,
      { binary: true, animations },
    )
  })
}
