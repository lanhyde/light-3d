import * as THREE from 'three'
import { useEditorStore } from '../state/editorStore'
import { registerAsset } from '../assets/assetStore'
import { exportGlb, instantiateGltfAsset, loadGltfWithResources } from '../assets/gltf'
import { applySceneDoc, serializeScene } from './serialize'
import { uniqueName } from './operations'

/** Serialize the current scene and download it as a .json file. */
export function saveSceneToFile(): void {
  const { engine } = useEditorStore.getState()
  if (!engine) return
  const doc = serializeScene(engine.scene)
  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' })
  downloadBlob(blob, 'scene.json')
}

/** Replace the current scene with the contents of a saved .json file. */
export async function loadSceneFromFile(file: File): Promise<void> {
  const { engine, bumpScene } = useEditorStore.getState()
  if (!engine) return
  const doc = JSON.parse(await file.text())
  await applySceneDoc(engine.scene, doc)
  bumpScene()
}

/**
 * Import a glTF/glb model and add it to the scene. Accepts multiple files so a
 * `.gltf` with separate `.bin`/texture files can be resolved together. The
 * model is normalized to a self-contained .glb asset for persistence/export.
 */
export async function importGltfFiles(files: File[]): Promise<void> {
  const { engine, setSelection, bumpScene } = useEditorStore.getState()
  if (!engine || files.length === 0) return

  const main = files.find((f) => /\.(glb|gltf)$/i.test(f.name))
  if (!main) throw new Error('Select a .glb or .gltf file (with its textures/.bin if separate)')

  let root: THREE.Object3D
  let glb: ArrayBuffer

  if (/\.glb$/i.test(main.name)) {
    // Already self-contained — store the bytes as-is.
    glb = await main.arrayBuffer()
    const id = registerAsset(toGlbName(main.name), 'model/gltf-binary', glb)
    root = await instantiateGltfAsset(id)
  } else {
    // .gltf with possibly external resources: resolve, then normalize to glb.
    const gltf = await loadGltfWithResources(main, files)
    root = gltf.scene
    glb = await exportGlb(root, gltf.animations)
    const id = registerAsset(toGlbName(main.name), 'model/gltf-binary', glb)
    root.userData.assetKind = 'gltf'
    root.userData.assetId = id
    if (gltf.animations.length > 0) root.userData.animations = gltf.animations
  }

  root.name = uniqueName(engine.scene, main.name.replace(/\.(glb|gltf)$/i, ''))
  engine.scene.add(root)
  setSelection([root.uuid])
  bumpScene()
}

const toGlbName = (name: string) => name.replace(/\.gltf$/i, '.glb')

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
