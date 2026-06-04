import * as THREE from 'three'
import type { Engine } from '../engine'
import type { AssetKind, BehaviorDoc } from './sceneTypes'

/**
 * Behavior system — Unity-style components that customize object behavior.
 *
 * A {@link BehaviorDefinition} is the editable *type* (its prop schema drives
 * the Inspector UI); its `create()` returns a live {@link BehaviorInstance}
 * bound to one object. Behavior data lives on `object.userData.behaviors` as
 * {@link BehaviorDoc}s, so it serializes with the scene and is shared between
 * the editor's Play mode and the exported viewer — same code, same result.
 */

export type PropValue = number | string | boolean

/** Shared services a behavior can reach at runtime (room to grow: input, events…). */
export interface BehaviorContext {
  scene: THREE.Scene
  /** The camera the scene is viewed through (present in Play / the viewer). */
  camera?: THREE.Camera
  /** Resolve a text asset (e.g. a script) by id to its source. */
  resolveTextAsset?: (assetId: string) => string | undefined
}

/** A pointer interaction (tap/click) resolved to a scene object. */
export interface PointerEventInfo {
  /** The object that was hit by the ray. */
  object: THREE.Object3D
  /** World-space point of intersection. */
  point: THREE.Vector3
}

export interface BehaviorInstance {
  /** Called once per frame while playing. `dt` is seconds since the last frame. */
  update?(dt: number, time: number): void
  /** Called when this object (or a descendant) is tapped/clicked. */
  onTap?(event: PointerEventInfo): void
}

/** Declares one editable property of a behavior (drives the Inspector control). */
export interface PropSpec {
  key: string
  label: string
  type: 'number' | 'axis' | 'boolean' | 'text' | 'code' | 'asset'
  default: PropValue
  step?: number
  /** For `type: 'asset'` — which kind of project asset this prop references. */
  assetKind?: AssetKind
}

export interface BehaviorDefinition {
  type: string
  label: string
  description?: string
  props: PropSpec[]
  create(
    object: THREE.Object3D,
    props: Record<string, PropValue>,
    ctx: BehaviorContext,
  ): BehaviorInstance
}

type Axis = 'x' | 'y' | 'z'

const AXIS_VEC: Record<Axis, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
}

const axisOf = (v: PropValue): Axis => (v === 'x' || v === 'z' ? v : 'y')

// --- Built-in behaviors ----------------------------------------------------

/** Spin continuously around a local axis at a fixed angular speed. */
const Rotate: BehaviorDefinition = {
  type: 'Rotate',
  label: 'Rotate',
  description: 'Spin continuously around a local axis.',
  props: [
    { key: 'axis', label: 'Axis', type: 'axis', default: 'y' },
    { key: 'speed', label: 'Speed (°/s)', type: 'number', default: 45, step: 5 },
  ],
  create(object, props) {
    const axis = axisOf(props.axis)
    const speed = THREE.MathUtils.degToRad(Number(props.speed ?? 45))
    return {
      update(dt) {
        object.rotation[axis] += speed * dt
      },
    }
  },
}

/** Revolve the object's position around an axis through the world origin. */
const Orbit: BehaviorDefinition = {
  type: 'Orbit',
  label: 'Orbit',
  description: 'Revolve around the origin on an axis.',
  props: [
    { key: 'axis', label: 'Axis', type: 'axis', default: 'y' },
    { key: 'speed', label: 'Speed (°/s)', type: 'number', default: 60, step: 5 },
  ],
  create(object, props) {
    const axis = AXIS_VEC[axisOf(props.axis)]
    const speed = THREE.MathUtils.degToRad(Number(props.speed ?? 60))
    return {
      update(dt) {
        object.position.applyAxisAngle(axis, speed * dt)
      },
    }
  },
}

/** Translate back and forth along an axis (sine wave around the start position). */
const Oscillate: BehaviorDefinition = {
  type: 'Oscillate',
  label: 'Oscillate',
  description: 'Move back and forth along an axis.',
  props: [
    { key: 'axis', label: 'Axis', type: 'axis', default: 'y' },
    { key: 'amplitude', label: 'Amplitude', type: 'number', default: 1, step: 0.1 },
    { key: 'frequency', label: 'Frequency (Hz)', type: 'number', default: 0.5, step: 0.1 },
  ],
  create(object, props) {
    const axis = axisOf(props.axis)
    const amplitude = Number(props.amplitude ?? 1)
    const frequency = Number(props.frequency ?? 0.5)
    const base = object.position[axis]
    return {
      update(_dt, time) {
        object.position[axis] = base + Math.sin(time * frequency * Math.PI * 2) * amplitude
      },
    }
  },
}

/** Orient the object to face the camera (billboard); optional upright lock. */
const LookAt: BehaviorDefinition = {
  type: 'LookAt',
  label: 'Look At Camera',
  description: 'Face the camera each frame (billboard).',
  props: [{ key: 'lockY', label: 'Upright (lock Y)', type: 'boolean', default: false }],
  create(object, props, ctx) {
    const lockY = Boolean(props.lockY)
    const target = new THREE.Vector3()
    return {
      update() {
        const cam = ctx.camera
        if (!cam) return
        target.copy(cam.position)
        if (lockY) target.y = object.position.y
        object.lookAt(target)
      },
    }
  },
}

/** Play an imported glTF model's animation clips via an AnimationMixer. */
const PlayAnimation: BehaviorDefinition = {
  type: 'PlayAnimation',
  label: 'Play Animation',
  description: "Play an imported model's clip (blank = first).",
  props: [
    { key: 'clip', label: 'Clip name', type: 'text', default: '' },
    { key: 'speed', label: 'Speed', type: 'number', default: 1, step: 0.1 },
  ],
  create(object, props) {
    const clips = object.userData.animations as THREE.AnimationClip[] | undefined
    if (!clips?.length) {
      console.warn('PlayAnimation: object has no animation clips')
      return { update() {} }
    }
    const name = String(props.clip ?? '')
    const clip = (name && THREE.AnimationClip.findByName(clips, name)) || clips[0]
    const mixer = new THREE.AnimationMixer(object)
    mixer.timeScale = Number(props.speed ?? 1)
    mixer.clipAction(clip).play()
    return {
      update(dt) {
        mixer.update(dt)
      },
    }
  },
}

// --- Custom scripts (user-authored behaviors) ------------------------------

/** What a user script receives. `THREE` is also injected as a free variable. */
export interface ScriptContext {
  object: THREE.Object3D
  scene: THREE.Scene
  camera?: THREE.Camera
  THREE: typeof THREE
}

interface CompiledScript {
  start?: (ctx: ScriptContext) => void
  update?: (dt: number, time: number, ctx: ScriptContext) => void
  onTap?: (event: PointerEventInfo, ctx: ScriptContext) => void
}

export const DEFAULT_SCRIPT = `// Custom behavior. Available: THREE, and ctx = { object, scene, camera }.
// Define start(ctx), update(dt, time, ctx), and/or onTap(event, ctx).
// Top-level variables persist as this behavior's state.

let spinning = false

function update(dt, time, ctx) {
  if (spinning) ctx.object.rotation.y += dt * 2
}

// Tap / click the object to toggle spinning.
function onTap(event, ctx) {
  spinning = !spinning
}
`

/** Compile user source into start/update/onTap fns. Throws on a syntax/eval error. */
function compileScript(source: string): CompiledScript {
  const factory = new Function(
    'THREE',
    `"use strict";\n${source}\n;return {\n  start: typeof start === 'function' ? start : undefined,\n  update: typeof update === 'function' ? update : undefined,\n  onTap: typeof onTap === 'function' ? onTap : undefined,\n};`,
  )
  return factory(THREE) as CompiledScript
}

/** Syntax-check a script without running it. Returns an error message or null. */
export function validateScript(source: string): string | null {
  try {
    new Function('THREE', `"use strict";\n${source}\n;return 0;`)
    return null
  } catch (e) {
    return e instanceof Error ? e.message : String(e)
  }
}

/**
 * A user-authored behavior. Compiles on create; runtime errors are caught and
 * disable the instance (so a throwing `update` can't crash or spam the loop).
 *
 * NOTE: runs author-provided code via `new Function`. That's fine for your own
 * scenes and self-hosted exports; treat scenes from untrusted sources with the
 * same caution as any third-party script (future: sandbox in a worker/iframe).
 */
const Script: BehaviorDefinition = {
  type: 'Script',
  label: 'Script',
  description: 'Run a script asset on this object.',
  props: [{ key: 'scriptId', label: 'Script asset', type: 'asset', assetKind: 'script', default: '' }],
  create(object, props, ctx) {
    // Resolve the referenced script asset; fall back to a legacy inline `source`.
    const fromAsset = props.scriptId ? ctx.resolveTextAsset?.(String(props.scriptId)) : undefined
    const source = String(fromAsset ?? props.source ?? '')
    let compiled: CompiledScript = {}
    let dead = false
    if (!source.trim()) return { update() {} }
    try {
      compiled = compileScript(source)
    } catch (e) {
      console.error('[Script] compile error:', e)
      dead = true
    }
    const sctx: ScriptContext = { object, scene: ctx.scene, camera: ctx.camera, THREE }
    if (!dead && compiled.start) {
      try {
        compiled.start(sctx)
      } catch (e) {
        console.error('[Script] start() error:', e)
        dead = true
      }
    }
    return {
      update(dt, time) {
        if (dead || !compiled.update) return
        try {
          compiled.update(dt, time, sctx)
        } catch (e) {
          console.error('[Script] update() error (behavior disabled):', e)
          dead = true
        }
      },
      onTap(event) {
        if (dead || !compiled.onTap) return
        try {
          compiled.onTap(event, sctx)
        } catch (e) {
          console.error('[Script] onTap() error (behavior disabled):', e)
          dead = true
        }
      },
    }
  },
}

// --- Registry --------------------------------------------------------------

const ALL: BehaviorDefinition[] = [Rotate, Orbit, Oscillate, LookAt, PlayAnimation, Script]

/** Registry of all known behavior types, keyed by `type`. */
export const BEHAVIOR_DEFS: Record<string, BehaviorDefinition> = Object.fromEntries(
  ALL.map((d) => [d.type, d]),
)

export const behaviorDefinitions = (): BehaviorDefinition[] => ALL

/** Build the default props object for a behavior type (used when adding one). */
export function defaultBehaviorProps(type: string): Record<string, PropValue> {
  const props: Record<string, PropValue> = {}
  const def = BEHAVIOR_DEFS[type]
  if (def) for (const p of def.props) props[p.key] = p.default
  return props
}

/**
 * Instantiates every behavior attached to objects in a scene and ticks them
 * each frame. Reads `object.userData.behaviors` on {@link start}, so add/remove
 * edits take effect on the next start (Play, or viewer boot).
 */
export class BehaviorRunner {
  private records: { object: THREE.Object3D; instance: BehaviorInstance }[] = []
  private unsubscribe: (() => void) | null = null
  private detachInput: (() => void) | null = null
  private readonly raycaster = new THREE.Raycaster()

  constructor(
    private readonly engine: Engine,
    private readonly scene: THREE.Scene,
    private readonly camera?: THREE.Camera,
    private readonly resolveTextAsset?: (assetId: string) => string | undefined,
  ) {}

  start(): void {
    if (this.unsubscribe) return
    const ctx: BehaviorContext = {
      scene: this.scene,
      camera: this.camera,
      resolveTextAsset: this.resolveTextAsset,
    }
    this.records = []
    this.scene.traverse((obj) => {
      const docs = obj.userData.behaviors as BehaviorDoc[] | undefined
      if (!docs?.length) return
      for (const doc of docs) {
        const def = BEHAVIOR_DEFS[doc.type]
        if (!def) {
          console.warn(`Unknown behavior "${doc.type}", skipping`)
          continue
        }
        try {
          this.records.push({ object: obj, instance: def.create(obj, doc.props, ctx) })
        } catch (e) {
          console.error(`Behavior "${doc.type}" failed to initialize:`, e)
        }
      }
    })
    this.unsubscribe = this.engine.onUpdate((dt, time) => {
      for (const r of this.records) r.instance.update?.(dt, time)
    })
    this.attachInput()
  }

  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    this.detachInput?.()
    this.detachInput = null
    this.records = []
  }

  /** Listen for taps on the canvas and route them to onTap handlers via raycast. */
  private attachInput(): void {
    const camera = this.camera
    if (!camera) return
    const dom = this.engine.renderer.domElement
    let downX = 0
    let downY = 0
    const onDown = (e: PointerEvent) => {
      downX = e.clientX
      downY = e.clientY
    }
    const onUp = (e: PointerEvent) => {
      // Treat a press-release without much movement as a tap (ignores orbit drags).
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) return
      this.dispatchTap(e, camera)
    }
    dom.addEventListener('pointerdown', onDown)
    dom.addEventListener('pointerup', onUp)
    this.detachInput = () => {
      dom.removeEventListener('pointerdown', onDown)
      dom.removeEventListener('pointerup', onUp)
    }
  }

  private dispatchTap(e: PointerEvent, camera: THREE.Camera): void {
    const dom = this.engine.renderer.domElement
    const rect = dom.getBoundingClientRect()
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    )
    this.raycaster.setFromCamera(ndc, camera)
    const hit = this.raycaster
      .intersectObjects(this.scene.children, true)
      .find((h) => !hasEditorOnlyAncestor(h.object))
    if (!hit) return
    const event: PointerEventInfo = { object: hit.object, point: hit.point.clone() }
    // Dispatch to behaviors on the hit object or any of its ancestors.
    for (const r of this.records) {
      if (r.instance.onTap && isSelfOrAncestor(r.object, hit.object)) {
        try {
          r.instance.onTap(event)
        } catch (err) {
          console.error('Behavior onTap error:', err)
        }
      }
    }
  }
}

function isSelfOrAncestor(maybeAncestor: THREE.Object3D, obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (o === maybeAncestor) return true
  }
  return false
}

function hasEditorOnlyAncestor(obj: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = obj; o; o = o.parent) {
    if (o.userData.editorOnly) return true
  }
  return false
}
