import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { Engine } from '../../engine'
import { BehaviorRunner } from '../../runtime/behaviors'
import { getAsset } from '../assets/assetStore'
import { activeUuid, useEditorStore } from '../state/editorStore'
import { deleteSelected, duplicateSelected } from '../scene/operations'
import { createMenuItems } from '../scene/factories'
import { useContextMenu, type MenuItem } from '../ui/contextMenuApi'

/**
 * Bridges the framework-agnostic {@link Engine} into React and hosts all the
 * editor-only, imperative Three.js glue: the authoring camera, orbit
 * navigation, the transform gizmo and pointer picking. Selection and gizmo
 * mode flow through the Zustand store so the surrounding panels stay in sync.
 */
export function Viewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const transformRef = useRef<TransformControls | null>(null)
  const pickRef = useRef<(x: number, y: number) => string | null>(() => null)

  const selectedUuids = useEditorStore((s) => s.selectedUuids)
  const transformMode = useEditorStore((s) => s.transformMode)
  const isPlaying = useEditorStore((s) => s.isPlaying)
  const active = activeUuid(selectedUuids)
  const { openMenu } = useContextMenu()

  // --- Mount: create engine + editor glue once ---
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const { select, bumpScene, setEngine } = useEditorStore.getState()

    const engine = new Engine()
    engineRef.current = engine

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000)
    camera.position.set(4, 3, 6)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera
    engine.setActiveCamera(camera)
    engine.mount(container)

    const dom = engine.renderer.domElement
    const orbit = new OrbitControls(camera, dom)
    orbit.enableDamping = true

    const transform = new TransformControls(camera, dom)
    transformRef.current = transform
    let dragging = false
    transform.addEventListener('dragging-changed', (e) => {
      dragging = e.value as boolean
      orbit.enabled = !dragging
    })
    transform.addEventListener('objectChange', () => bumpScene())
    const gizmo = transform.getHelper()
    gizmo.userData.editorOnly = true
    engine.scene.add(gizmo)

    populateDemoScene(engine.scene)
    const stopOrbitUpdate = engine.onUpdate(() => orbit.update())

    // --- Raycast picking, shared by click selection and the context menu ---
    const raycaster = new THREE.Raycaster()
    const ndc = new THREE.Vector2()
    const pickAt = (clientX: number, clientY: number): string | null => {
      const rect = dom.getBoundingClientRect()
      ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1
      ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1
      raycaster.setFromCamera(ndc, camera)
      const hit = raycaster
        .intersectObjects(engine.scene.children, true)
        .find((h) => isSelectable(h.object))
      return hit ? hit.object.uuid : null
    }
    pickRef.current = pickAt

    let downX = 0
    let downY = 0
    const onPointerDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onPointerUp = (e: PointerEvent) => {
      if (dragging || e.button !== 0) return
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 4) return
      const uuid = pickAt(e.clientX, e.clientY)
      const additive = e.ctrlKey || e.metaKey
      if (uuid) select(uuid, additive)
      else if (!additive) select(null)
    }
    dom.addEventListener('pointerdown', onPointerDown)
    dom.addEventListener('pointerup', onPointerUp)

    // --- Keyboard: gizmo modes, delete, duplicate, deselect ---
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const { setTransformMode } = useEditorStore.getState()
      if (e.key === 'w') setTransformMode('translate')
      else if (e.key === 'e') setTransformMode('rotate')
      else if (e.key === 'r') setTransformMode('scale')
      else if (e.key === 'Escape') select(null)
      else if (e.key === 'Delete' || e.key === 'Backspace') deleteSelected()
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateSelected()
      }
    }
    window.addEventListener('keydown', onKeyDown)

    setEngine(engine)
    engine.start()

    return () => {
      dom.removeEventListener('pointerdown', onPointerDown)
      dom.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('keydown', onKeyDown)
      stopOrbitUpdate()
      transform.detach()
      transform.dispose()
      orbit.dispose()
      engine.dispose()
      engineRef.current = null
      transformRef.current = null
      setEngine(null)
    }
  }, [])

  // --- Attach/detach the gizmo as the active object changes ---
  useEffect(() => {
    const transform = transformRef.current
    const engine = engineRef.current
    if (!transform || !engine) return
    const obj = active ? engine.scene.getObjectByProperty('uuid', active) : null
    if (obj) transform.attach(obj)
    else transform.detach()
  }, [active])

  // --- Reflect gizmo mode changes ---
  useEffect(() => {
    transformRef.current?.setMode(transformMode)
  }, [transformMode])

  // --- Play mode: run behaviors, non-destructively ---
  useEffect(() => {
    const engine = engineRef.current
    if (!engine || !isPlaying) return

    // Snapshot transforms so Stop restores the authored pose.
    const snapshot = new Map<THREE.Object3D, { p: THREE.Vector3; q: THREE.Quaternion; s: THREE.Vector3 }>()
    engine.scene.traverse((o) => {
      if (o.userData.editorOnly) return
      snapshot.set(o, { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() })
    })
    transformRef.current?.detach() // gizmo would fight moving objects

    const runner = new BehaviorRunner(
      engine,
      engine.scene,
      cameraRef.current ?? undefined,
      (id) => getAsset(id)?.text,
    )
    runner.start()

    return () => {
      runner.stop()
      for (const [o, t] of snapshot) {
        o.position.copy(t.p)
        o.quaternion.copy(t.q)
        o.scale.copy(t.s)
      }
      // Reattach the gizmo to the active object and refresh panels.
      const { selectedUuids, bumpScene } = useEditorStore.getState()
      const a = activeUuid(selectedUuids)
      const obj = a ? engine.scene.getObjectByProperty('uuid', a) : null
      if (obj) transformRef.current?.attach(obj)
      bumpScene()
    }
  }, [isPlaying])

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const uuid = pickRef.current(e.clientX, e.clientY)
    let items: MenuItem[]
    if (uuid) {
      const { selectedUuids, select } = useEditorStore.getState()
      if (!selectedUuids.includes(uuid)) select(uuid)
      items = [
        { label: 'Duplicate', onClick: duplicateSelected },
        { label: 'Delete', onClick: deleteSelected },
      ]
    } else {
      items = createMenuItems()
    }
    openMenu(e.clientX, e.clientY, items)
  }

  return (
    <div
      ref={containerRef}
      onContextMenu={onContextMenu}
      style={{ width: '100%', height: '100%' }}
    />
  )
}

/** An object is selectable unless it (or an ancestor) is an editor-only helper. */
function isSelectable(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (o.userData.editorOnly) return false
  }
  return true
}

/** Temporary scaffolding content so the viewport isn't empty. */
function populateDemoScene(scene: THREE.Scene) {
  scene.background = new THREE.Color(0x1a1b20)

  const grid = new THREE.GridHelper(20, 20, 0x444444, 0x2a2a2a)
  grid.name = 'EditorGrid'
  grid.userData.editorOnly = true // excluded from picking, hierarchy and export
  scene.add(grid)

  const ambient = new THREE.AmbientLight(0xffffff, 0.6)
  ambient.name = 'Ambient Light'
  const key = new THREE.DirectionalLight(0xffffff, 1.2)
  key.name = 'Key Light'
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
