import * as THREE from 'three'
import { Timer } from 'three'

/**
 * Per-frame update callback.
 * @param dt   Seconds elapsed since the previous frame.
 * @param time Seconds elapsed since the engine started.
 */
export type UpdateCallback = (dt: number, time: number) => void

/**
 * Framework-agnostic runtime core.
 *
 * Owns the WebGL renderer, the scene graph and the render loop. It knows
 * nothing about React or the editor UI — the exact same class is meant to be
 * reused by exported projects. Anything editor-specific (camera navigation,
 * gizmos, selection helpers) lives in the `editor/` layer and is layered on
 * top of this through the public API below.
 */
export class Engine {
  readonly scene: THREE.Scene
  readonly renderer: THREE.WebGLRenderer
  readonly timer: Timer

  private container: HTMLElement | null = null
  private activeCamera: THREE.Camera | null = null
  private resizeObserver: ResizeObserver | null = null
  private rafId = 0
  private running = false
  private readonly updateCallbacks = new Set<UpdateCallback>()

  constructor() {
    this.scene = new THREE.Scene()
    this.timer = new Timer()

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
  }

  /** Attach the renderer's canvas to a DOM container and size it to fit. */
  mount(container: HTMLElement): void {
    this.container = container
    container.appendChild(this.renderer.domElement)
    this.handleResize()

    this.resizeObserver = new ResizeObserver(() => this.handleResize())
    this.resizeObserver.observe(container)
  }

  /** Detach the canvas and stop observing resizes. Safe to call repeatedly. */
  unmount(): void {
    this.stop()
    this.resizeObserver?.disconnect()
    this.resizeObserver = null
    this.renderer.domElement.remove()
    this.container = null
  }

  /** The camera the render loop draws from. Provided by the editor or scene. */
  setActiveCamera(camera: THREE.Camera): void {
    this.activeCamera = camera
    this.handleResize()
  }

  /** Register a per-frame callback. Returns a function that unregisters it. */
  onUpdate(callback: UpdateCallback): () => void {
    this.updateCallbacks.add(callback)
    return () => this.updateCallbacks.delete(callback)
  }

  /** Begin the render loop. */
  start(): void {
    if (this.running) return
    this.running = true
    this.timer.reset()
    const tick = () => {
      this.rafId = requestAnimationFrame(tick)
      this.frame()
    }
    this.rafId = requestAnimationFrame(tick)
  }

  /** Pause the render loop. */
  stop(): void {
    if (!this.running) return
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  /** Release GPU resources. Call when the engine is permanently discarded. */
  dispose(): void {
    this.unmount()
    this.updateCallbacks.clear()
    this.renderer.dispose()
  }

  private frame(): void {
    this.timer.update()
    const dt = this.timer.getDelta()
    const time = this.timer.getElapsed()
    for (const cb of this.updateCallbacks) cb(dt, time)
    if (this.activeCamera) this.renderer.render(this.scene, this.activeCamera)
  }

  private handleResize(): void {
    if (!this.container) return
    const { clientWidth: w, clientHeight: h } = this.container
    if (w === 0 || h === 0) return
    this.renderer.setSize(w, h, false)
    const cam = this.activeCamera
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.aspect = w / h
      cam.updateProjectionMatrix()
    }
  }
}
