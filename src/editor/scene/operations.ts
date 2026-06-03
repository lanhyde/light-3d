import * as THREE from 'three'
import { useEditorStore } from '../state/editorStore'

/** Dispose the geometry and material(s) of every mesh under an object. */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat?.dispose()
  })
}

/**
 * Deep-clone an object, giving each mesh its own geometry and material so the
 * copy is fully independent — otherwise deleting (and disposing) one would
 * corrupt the shared GPU resources of the other.
 */
function cloneObject(obj: THREE.Object3D): THREE.Object3D {
  const clone = obj.clone(true)
  clone.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry = mesh.geometry.clone()
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((m) => m.clone())
      : mesh.material.clone()
  })
  return clone
}

/** Ensure a name is unique within the scene by appending an incrementing suffix. */
export function uniqueName(scene: THREE.Scene, base: string): string {
  const taken = new Set<string>()
  scene.traverse((o) => taken.add(o.name))
  if (!taken.has(base)) return base
  for (let i = 1; ; i++) {
    const candidate = `${base} ${i}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Remove the given objects from the scene and free their resources. */
export function deleteObjects(uuids: string[]): void {
  const { engine, selectedUuids, setSelection, bumpScene } = useEditorStore.getState()
  if (!engine || uuids.length === 0) return

  for (const uuid of uuids) {
    const obj = engine.scene.getObjectByProperty('uuid', uuid)
    if (!obj || obj.userData.editorOnly) continue
    obj.parent?.remove(obj)
    disposeObject(obj)
  }

  const removed = new Set(uuids)
  setSelection(selectedUuids.filter((id) => !removed.has(id)))
  bumpScene()
}

export function deleteSelected(): void {
  deleteObjects(useEditorStore.getState().selectedUuids)
}

/**
 * Remove and dispose every non-editor object in the scene, clearing selection.
 * Used before loading a saved scene. Does not bump the revision — the caller
 * does so after rebuilding.
 */
export function clearSceneContent(): void {
  const { engine, setSelection } = useEditorStore.getState()
  if (!engine) return
  for (const obj of [...engine.scene.children]) {
    if (obj.userData.editorOnly) continue
    engine.scene.remove(obj)
    disposeObject(obj)
  }
  setSelection([])
}

/** Duplicate the given objects, offset slightly, and select the copies. */
export function duplicateObjects(uuids: string[]): void {
  const { engine, setSelection, bumpScene } = useEditorStore.getState()
  if (!engine || uuids.length === 0) return

  const newUuids: string[] = []
  for (const uuid of uuids) {
    const obj = engine.scene.getObjectByProperty('uuid', uuid)
    if (!obj || obj.userData.editorOnly) continue
    const clone = cloneObject(obj)
    clone.name = uniqueName(engine.scene, obj.name || obj.type)
    clone.position.add(new THREE.Vector3(0.5, 0, 0.5))
    ;(obj.parent ?? engine.scene).add(clone)
    newUuids.push(clone.uuid)
  }

  if (newUuids.length > 0) {
    setSelection(newUuids)
    bumpScene()
  }
}

export function duplicateSelected(): void {
  duplicateObjects(useEditorStore.getState().selectedUuids)
}

/**
 * Move `childUuid` under `parentUuid` (or the scene root when null), preserving
 * the object's world transform. No-ops on invalid moves (onto itself, into its
 * own subtree, or when already parented there).
 */
export function reparentObject(childUuid: string, parentUuid: string | null): void {
  const { engine, bumpScene } = useEditorStore.getState()
  if (!engine) return

  const child = engine.scene.getObjectByProperty('uuid', childUuid)
  if (!child || child.userData.editorOnly) return

  const newParent: THREE.Object3D | null = parentUuid
    ? (engine.scene.getObjectByProperty('uuid', parentUuid) ?? null)
    : engine.scene
  if (!newParent || newParent.userData.editorOnly) return
  if (newParent === child || child.parent === newParent) return

  // Prevent cycles: the new parent must not live inside the child's subtree.
  let inSubtree = false
  child.traverse((o) => {
    if (o === newParent) inSubtree = true
  })
  if (inSubtree) return

  newParent.attach(child) // attach() keeps the world transform; add() would not
  bumpScene()
}

/**
 * Insert `childUuid` as a sibling immediately before/after `targetUuid`,
 * preserving its world transform. Used for drag-reorder within the hierarchy.
 */
export function moveObject(
  childUuid: string,
  targetUuid: string,
  position: 'before' | 'after',
): void {
  const { engine, bumpScene } = useEditorStore.getState()
  if (!engine) return

  const child = engine.scene.getObjectByProperty('uuid', childUuid)
  const target = engine.scene.getObjectByProperty('uuid', targetUuid)
  if (!child || !target || child === target) return
  if (child.userData.editorOnly || target.userData.editorOnly) return

  const parent = target.parent
  if (!parent) return
  // Prevent cycles: the destination parent must not live inside the child.
  for (let o: THREE.Object3D | null = parent; o; o = o.parent) {
    if (o === child) return
  }

  parent.attach(child) // preserves world transform; child ends up last in parent.children
  const siblings = parent.children
  siblings.splice(siblings.indexOf(child), 1)
  let idx = siblings.indexOf(target)
  if (idx === -1) {
    siblings.push(child)
  } else {
    if (position === 'after') idx += 1
    siblings.splice(idx, 0, child)
  }
  bumpScene()
}

/** Add a freshly built object to the scene, name it uniquely, and select it. */
export function addObject(create: () => THREE.Object3D, baseName: string): void {
  const { engine, setSelection, bumpScene } = useEditorStore.getState()
  if (!engine) return
  const obj = create()
  obj.name = uniqueName(engine.scene, baseName)
  engine.scene.add(obj)
  setSelection([obj.uuid])
  bumpScene()
}
