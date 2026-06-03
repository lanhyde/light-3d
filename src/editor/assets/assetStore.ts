/**
 * In-memory registry of imported binary assets (currently glTF/glb files).
 *
 * Assets are kept as raw bytes keyed by id. The scene serializer references
 * them by id and embeds their bytes (base64) into the saved document so a saved
 * scene is fully self-contained. At export time these can instead be written
 * out as separate files.
 */
export interface Asset {
  id: string
  name: string
  mimeType: string
  bytes: ArrayBuffer
}

const assets = new Map<string, Asset>()

/** Register new bytes under a fresh id. */
export function registerAsset(name: string, mimeType: string, bytes: ArrayBuffer): string {
  const id = crypto.randomUUID()
  assets.set(id, { id, name, mimeType, bytes })
  return id
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

export function clearAssets(): void {
  assets.clear()
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
