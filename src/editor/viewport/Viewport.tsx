import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Engine } from '../../engine'

/**
 * Bridges the framework-agnostic {@link Engine} into React.
 *
 * Everything Three.js lives behind this boundary: React owns the container
 * element, the engine owns the canvas inside it. The editor camera and its
 * navigation controls are created *here*, in the editor layer, not in the
 * engine — in an exported project the runtime camera comes from the scene
 * instead, while this orbit camera is purely an authoring convenience.
 */
export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const engine = new Engine()

    // --- Editor camera + navigation (authoring-only, not exported) ---
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.set(4, 3, 6)
    camera.lookAt(0, 0, 0)
    engine.setActiveCamera(camera)

    engine.mount(container)
    const controls = new OrbitControls(camera, engine.renderer.domElement)
    controls.enableDamping = true
    const unsubscribe = engine.onUpdate(() => controls.update())

    // --- Placeholder default scene (will become a real, serializable scene) ---
    populateDemoScene(engine.scene)

    engine.start()

    return () => {
      unsubscribe()
      controls.dispose()
      engine.dispose()
    }
  }, [])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

/** Temporary scaffolding content so the viewport isn't empty. */
function populateDemoScene(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x1a1b20)

  // Editor-only grid helper — excluded from export later.
  const grid = new THREE.GridHelper(20, 20, 0x444444, 0x2a2a2a)
  grid.name = 'EditorGrid'
  scene.add(grid)

  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.position.set(5, 8, 4)
  scene.add(ambient, key)

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xaa3bff, roughness: 0.4, metalness: 0.1 }),
  )
  cube.name = 'Cube'
  cube.position.y = 0.5
  scene.add(cube)
}
