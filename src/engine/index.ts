/**
 * Public surface of the framework-agnostic engine runtime.
 *
 * The editor (and any exported project) should import from here only — never
 * reach into `engine/core/*` directly. This keeps the boundary between the
 * reusable runtime and everything built on top of it explicit.
 */
export { Engine } from './core/Engine'
export type { UpdateCallback } from './core/Engine'
