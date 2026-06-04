import type { AssetKind } from '../../runtime/sceneTypes'

/**
 * In-memory registry of project assets — the data behind the Project window.
 *
 * Binary assets (imported glTF/glb models) keep raw `bytes`; text assets
 * (scripts, shaders, animations) keep `text`. The scene serializer embeds them
 * (base64 for binary, inline for text) so a saved scene is self-contained; at
 * export time binary assets are written as separate files and text rides inline.
 */
export interface Asset {
  id: string
  name: string
  kind: AssetKind
  mimeType: string
  bytes?: ArrayBuffer
  text?: string
}

const assets = new Map<string, Asset>()

/** Register binary bytes (e.g. an imported model) under a fresh id. */
export function registerAsset(name: string, mimeType: string, bytes: ArrayBuffer): string {
  const id = crypto.randomUUID()
  assets.set(id, { id, name, kind: 'model', mimeType, bytes })
  return id
}

const MIME: Record<Exclude<AssetKind, 'model'>, string> = {
  script: 'text/javascript',
  shader: 'x-shader/x-fragment',
  animation: 'application/json',
}

/** Create a new text asset (script/shader/animation) with starter content. */
export function createTextAsset(kind: Exclude<AssetKind, 'model'>, name: string, text: string): string {
  const id = crypto.randomUUID()
  assets.set(id, { id, name: uniqueAssetName(name), kind, mimeType: MIME[kind], text })
  return id
}

export function updateAssetText(id: string, text: string): void {
  const asset = assets.get(id)
  if (asset) asset.text = text
}

export function renameAsset(id: string, name: string): void {
  const asset = assets.get(id)
  if (asset) asset.name = name.trim() || asset.name
}

export function removeAsset(id: string): void {
  assets.delete(id)
}

/** Insert/replace an asset with a known id (used when loading a saved scene). */
export function putAsset(asset: Asset): void {
  assets.set(asset.id, asset)
}

export function getAsset(id: string): Asset | undefined {
  return assets.get(id)
}

export function allAssets(): Asset[] {
  return [...assets.values()]
}

export function assetsOfKind(kind: AssetKind): Asset[] {
  return allAssets().filter((a) => a.kind === kind)
}

export function clearAssets(): void {
  assets.clear()
}

/** Append a numeric suffix if `name` collides with an existing asset name. */
function uniqueAssetName(name: string): string {
  const taken = new Set(allAssets().map((a) => a.name))
  if (!taken.has(name)) return name
  for (let i = 2; ; i++) {
    const candidate = `${name} ${i}`
    if (!taken.has(candidate)) return candidate
  }
}

/** Encode bytes to base64 in chunks (avoids call-stack limits on large files). */
export function bytesToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}
