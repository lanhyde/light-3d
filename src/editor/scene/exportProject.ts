import { zipSync, strToU8 } from 'fflate'
import { useEditorStore } from '../state/editorStore'
import { getAsset } from '../assets/assetStore'
import { serializeScene } from './serialize'

const VIEWER_URL = '/export/light3d-viewer.js'
const VIEWER_FILENAME = 'light3d-viewer.js'

/**
 * Export the current scene as a runnable, self-contained web bundle (.zip):
 *
 *   index.html            — boots the orbit viewer
 *   scene.json            — the scene document (assets referenced by file)
 *   light3d-viewer.js     — prebuilt runtime (Engine + loader + three, bundled)
 *   assets/<id>.glb       — one file per imported glTF asset
 *   README.txt
 *
 * The bundle reuses the editor's own Engine/loader, so it renders identically.
 * It runs by serving the folder over HTTP (ES modules don't load from file://).
 */
export async function exportWebBundle(filename = 'scene-web-export.zip'): Promise<void> {
  const { engine } = useEditorStore.getState()
  if (!engine) return

  const doc = serializeScene(engine.scene)

  // Pull the prebuilt runtime. Built by `npm run build:runtime` into public/.
  const res = await fetch(VIEWER_URL)
  if (!res.ok) {
    throw new Error(
      `Could not load the viewer runtime (${VIEWER_URL}). Run "npm run build:runtime" first.`,
    )
  }
  const viewerJs = await res.text()

  // Binary models become separate files (stripped from scene.json); text assets
  // (scripts/shaders) stay inline in scene.json since they're small.
  const files: Record<string, Uint8Array> = {}
  for (const asset of doc.assets) {
    if (asset.kind !== 'model') continue
    const stored = getAsset(asset.id)
    if (!stored?.bytes) throw new Error(`Asset bytes missing for "${asset.id}"`)
    files[`assets/${asset.id}.glb`] = new Uint8Array(stored.bytes)
  }
  const sceneJson = {
    ...doc,
    assets: doc.assets.map((a) =>
      a.kind === 'model'
        ? { id: a.id, name: a.name, kind: a.kind, mimeType: a.mimeType }
        : { id: a.id, name: a.name, kind: a.kind, mimeType: a.mimeType, text: a.text },
    ),
  }

  files['index.html'] = strToU8(INDEX_HTML)
  files[VIEWER_FILENAME] = strToU8(viewerJs)
  files['scene.json'] = strToU8(JSON.stringify(sceneJson))
  files['README.txt'] = strToU8(README)

  const zipped = zipSync(files)
  downloadBlob(new Blob([zipped], { type: 'application/zip' }), filename)
}

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>light-3d scene</title>
    <style>
      html, body { margin: 0; height: 100%; background: #1a1b20; overflow: hidden; }
      #app { width: 100%; height: 100%; }
      .error { color: #ff8a8a; font: 13px/1.5 monospace; padding: 16px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      import { mountViewer } from './${VIEWER_FILENAME}'

      async function main() {
        const doc = await (await fetch('./scene.json')).json()
        const assets = {}
        for (const a of doc.assets) {
          if (a.kind !== 'model') continue
          assets[a.id] = await (await fetch('./assets/' + a.id + '.glb')).arrayBuffer()
        }
        await mountViewer(document.getElementById('app'), doc, { assets })
      }

      main().catch((err) => {
        console.error(err)
        document.body.innerHTML = '<pre class="error">' + (err && err.stack || err) + '</pre>'
      })
    </script>
  </body>
</html>
`

const README = `light-3d scene export
=====================

A self-contained web build of your scene. It renders with the same engine as
the editor and lets you orbit (drag to rotate, scroll to zoom).

Run it:
  Because it uses ES modules, open it over HTTP rather than double-clicking.
  From this folder:

    npx serve .
      (or)
    python3 -m http.server

  then open the printed URL.

Files:
  index.html          entry page (boots the viewer)
  light3d-viewer.js   the runtime (three.js bundled in)
  scene.json          your scene
  assets/             imported glTF models, one .glb per asset
`

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
