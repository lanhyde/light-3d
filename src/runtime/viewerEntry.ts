import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Engine } from '../engine'
import { buildScene } from './sceneLoader'
import { BehaviorRunner } from './behaviors'
import type { SceneDoc } from './sceneTypes'

export type { SceneDoc } from './sceneTypes'

export interface ViewerOptions {
  /** glTF asset bytes keyed by asset id (resolved from the bundle's assets/). */
  assets?: Record<string, ArrayBuffer>
  /** Scene clear color. Defaults to the editor's viewport background. */
  background?: number
}

export interface Viewer {
  engine: Engine
  controls: OrbitControls
  dispose: () => void
}

/**
 * Boot a runnable orbit-viewer for an exported scene. This is the entry point
 * bundled into `light3d-viewer.js`; an exported `index.html` fetches its
 * `scene.json` + asset files and calls `mountViewer(container, doc, { assets })`.
 *
 * Reuses the same {@link Engine} and {@link buildScene} as the editor, so what
 * you see in the export matches the editor (minus editor-only helpers, which are
 * never serialized).
 */
export async function mountViewer(
  container: HTMLElement,
  doc: SceneDoc,
  options: ViewerOptions = {},
): Promise<Viewer> {
  const engine = new Engine()
  engine.scene.background = new THREE.Color(options.background ?? 0x1a1b20)

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
  camera.position.set(4, 3, 6)
  camera.lookAt(0, 0, 0)
  engine.setActiveCamera(camera)
  engine.mount(container)

  const controls = new OrbitControls(camera, engine.renderer.domElement)
  controls.enableDamping = true
  const stopOrbit = engine.onUpdate(() => controls.update())

  const assets = options.assets ?? {}
  const resolveAsset = (id: string): ArrayBuffer => {
    const bytes = assets[id]
    if (!bytes) throw new Error(`Missing asset bytes for "${id}"`)
    return bytes
  }
  for (const root of await buildScene(doc, resolveAsset)) engine.scene.add(root)

  // Text assets (scripts/shaders) ride inline in the doc; index by id for behaviors.
  const textAssets: Record<string, string> = {}
  for (const a of doc.assets) if (a.text != null) textAssets[a.id] = a.text

  // Exported scenes always "play" — behaviors drive the experience.
  const behaviors = new BehaviorRunner(engine, engine.scene, camera, (id) => textAssets[id])
  behaviors.start()

  engine.start()

  return {
    engine,
    controls,
    dispose: () => {
      behaviors.stop()
      stopOrbit()
      controls.dispose()
      engine.dispose()
    },
  }
}
