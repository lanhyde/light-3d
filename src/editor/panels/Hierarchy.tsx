import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type * as THREE from 'three'
import { activeUuid, useEditorStore } from '../state/editorStore'
import {
  deleteSelected,
  duplicateSelected,
  moveObject,
  reparentObject,
} from '../scene/operations'
import { useContextMenu } from '../ui/ContextMenu'
import './panels.css'

type DropPosition = 'before' | 'after' | 'inside'

/**
 * Renders the live scene graph as a clickable tree. Reads straight from the
 * mutable Three.js scene on each render, re-running whenever `sceneRevision`
 * changes. Editor-only helpers (grid, gizmo) are hidden. Supports:
 *  - click / Ctrl-click (toggle) / Shift-click (range) selection
 *  - double-click to rename
 *  - collapse/expand via disclosure arrows
 *  - drag to reorder (before/after a sibling) or reparent (drop onto a row);
 *    dropping onto empty space reparents to the scene root
 */
export function Hierarchy() {
  const engine = useEditorStore((s) => s.engine)
  const selectedUuids = useEditorStore((s) => s.selectedUuids)
  const select = useEditorStore((s) => s.select)
  const setSelection = useEditorStore((s) => s.setSelection)
  const bumpScene = useEditorStore((s) => s.bumpScene)
  useEditorStore((s) => s.sceneRevision) // re-read on every mutation
  const { openMenu } = useContextMenu()

  const [renamingUuid, setRenamingUuid] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [dropTarget, setDropTarget] = useState<{ uuid: string; position: DropPosition } | null>(
    null,
  )
  const dragUuid = useRef<string | null>(null)

  if (!engine) return <p className="panel__placeholder">Loading…</p>

  const roots = engine.scene.children.filter((o) => !o.userData.editorOnly)
  if (roots.length === 0) return <p className="panel__placeholder">Empty scene</p>

  const active = activeUuid(selectedUuids)
  const selected = new Set(selectedUuids)

  // Depth-first flattened order of *visible* rows (skipping collapsed subtrees),
  // for Shift range selection.
  const flatOrder: string[] = []
  const flatten = (objs: THREE.Object3D[]) => {
    for (const o of objs) {
      if (o.userData.editorOnly) continue
      flatOrder.push(o.uuid)
      if (!collapsed.has(o.uuid)) flatten(o.children)
    }
  }
  flatten(roots)

  const isValidDrop = (targetUuid: string | null, position: DropPosition): boolean => {
    const src = dragUuid.current
    if (!src || src === targetUuid) return false
    const dragged = engine.scene.getObjectByProperty('uuid', src)
    if (!dragged) return false
    if (targetUuid === null) return dragged.parent !== engine.scene
    // Target must not be inside the dragged object's own subtree.
    let inSubtree = false
    dragged.traverse((o) => {
      if (o.uuid === targetUuid) inSubtree = true
    })
    if (inSubtree) return false
    const target = engine.scene.getObjectByProperty('uuid', targetUuid)
    if (!target) return false
    if (position === 'inside') return target !== dragged.parent
    return target.parent != null
  }

  const performDrop = (targetUuid: string | null, position: DropPosition) => {
    const src = dragUuid.current
    if (src && isValidDrop(targetUuid, position)) {
      if (targetUuid === null || position === 'inside') reparentObject(src, targetUuid)
      else moveObject(src, targetUuid, position)
    }
    dragUuid.current = null
    setDropTarget(null)
  }

  const ctx: HierarchyCtx = {
    selected,
    active,
    renamingUuid,
    collapsed,
    dropTarget,
    onRowClick: (e, uuid) => {
      if (e.shiftKey && active) {
        const a = flatOrder.indexOf(active)
        const b = flatOrder.indexOf(uuid)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a]
          setSelection(flatOrder.slice(lo, hi + 1))
          return
        }
      }
      select(uuid, e.ctrlKey || e.metaKey)
    },
    onContextMenu: (e, uuid) => {
      e.preventDefault()
      if (!selected.has(uuid)) select(uuid)
      openMenu(e.clientX, e.clientY, [
        { label: 'Rename', onClick: () => setRenamingUuid(uuid) },
        { label: 'Duplicate', onClick: duplicateSelected },
        { label: 'Delete', onClick: deleteSelected },
      ])
    },
    onToggleCollapse: (uuid) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        next.has(uuid) ? next.delete(uuid) : next.add(uuid)
        return next
      }),
    onStartRename: setRenamingUuid,
    onCommitRename: (uuid, name) => {
      const obj = engine.scene.getObjectByProperty('uuid', uuid)
      if (obj) {
        obj.name = name.trim() || obj.name
        bumpScene()
      }
      setRenamingUuid(null)
    },
    onCancelRename: () => setRenamingUuid(null),
    onDragStart: (uuid) => {
      dragUuid.current = uuid
    },
    onDragOver: (e, uuid) => {
      const position = zoneFromEvent(e)
      if (!isValidDrop(uuid, position)) {
        if (dropTarget) setDropTarget(null)
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (dropTarget?.uuid !== uuid || dropTarget?.position !== position) {
        setDropTarget({ uuid, position })
      }
    },
    onDropRow: (e, uuid) => {
      e.stopPropagation()
      performDrop(uuid, zoneFromEvent(e))
    },
    onDragEnd: () => {
      dragUuid.current = null
      setDropTarget(null)
    },
  }

  return (
    <HierarchyContext.Provider value={ctx}>
      <div
        className="tree-root"
        onDragOver={(e) => {
          if (isValidDrop(null, 'inside')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'move'
          }
        }}
        onDrop={() => performDrop(null, 'inside')}
      >
        <ul className="tree">
          {roots.map((obj) => (
            <TreeNode key={obj.uuid} obj={obj} depth={0} />
          ))}
        </ul>
      </div>
    </HierarchyContext.Provider>
  )
}

/** Which third of a row the pointer is over → insert before / after / nest inside. */
function zoneFromEvent(e: React.DragEvent): DropPosition {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  if (y < rect.height * 0.25) return 'before'
  if (y > rect.height * 0.75) return 'after'
  return 'inside'
}

interface HierarchyCtx {
  selected: Set<string>
  active: string | null
  renamingUuid: string | null
  collapsed: Set<string>
  dropTarget: { uuid: string; position: DropPosition } | null
  onRowClick: (e: React.MouseEvent, uuid: string) => void
  onContextMenu: (e: React.MouseEvent, uuid: string) => void
  onToggleCollapse: (uuid: string) => void
  onStartRename: (uuid: string) => void
  onCommitRename: (uuid: string, name: string) => void
  onCancelRename: () => void
  onDragStart: (uuid: string) => void
  onDragOver: (e: React.DragEvent, uuid: string) => void
  onDropRow: (e: React.DragEvent, uuid: string) => void
  onDragEnd: () => void
}

const HierarchyContext = createContext<HierarchyCtx | null>(null)
const useHierarchy = () => useContext(HierarchyContext)!

function TreeNode({ obj, depth }: { obj: THREE.Object3D; depth: number }) {
  const ctx = useHierarchy()
  const children = obj.children.filter((o) => !o.userData.editorOnly)
  const hasChildren = children.length > 0
  const isCollapsed = ctx.collapsed.has(obj.uuid)
  const isSelected = ctx.selected.has(obj.uuid)
  const isActive = obj.uuid === ctx.active
  const isRenaming = ctx.renamingUuid === obj.uuid
  const drop = ctx.dropTarget?.uuid === obj.uuid ? ctx.dropTarget.position : null

  return (
    <li>
      <div
        className={
          'tree__row' +
          (isSelected ? ' tree__row--selected' : '') +
          (isActive ? ' tree__row--active' : '') +
          (drop === 'inside' ? ' tree__row--drop' : '') +
          (drop === 'before' ? ' tree__row--drop-before' : '') +
          (drop === 'after' ? ' tree__row--drop-after' : '')
        }
        style={{ paddingLeft: 6 + depth * 14 }}
        draggable={!isRenaming}
        onClick={(e) => !isRenaming && ctx.onRowClick(e, obj.uuid)}
        onDoubleClick={() => ctx.onStartRename(obj.uuid)}
        onContextMenu={(e) => ctx.onContextMenu(e, obj.uuid)}
        onDragStart={() => ctx.onDragStart(obj.uuid)}
        onDragOver={(e) => ctx.onDragOver(e, obj.uuid)}
        onDrop={(e) => ctx.onDropRow(e, obj.uuid)}
        onDragEnd={ctx.onDragEnd}
      >
        <span
          className="tree__arrow"
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) ctx.onToggleCollapse(obj.uuid)
          }}
        >
          {hasChildren ? (isCollapsed ? '▸' : '▾') : ''}
        </span>
        {isRenaming ? (
          <RenameInput
            initial={obj.name}
            onCommit={(name) => ctx.onCommitRename(obj.uuid, name)}
            onCancel={ctx.onCancelRename}
          />
        ) : (
          <>
            <span className="tree__label">{obj.name || obj.type}</span>
            <span className="tree__type">{obj.type}</span>
          </>
        )}
      </div>
      {hasChildren && !isCollapsed && (
        <ul className="tree">
          {children.map((child) => (
            <TreeNode key={child.uuid} obj={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

function RenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string
  onCommit: (name: string) => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  const [text, setText] = useState(initial)
  // Guards against the blur handler firing a second time after an explicit
  // Enter/Escape (which unmounts the input and triggers blur).
  const finished = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  const commit = () => {
    if (finished.current) return
    finished.current = true
    onCommit(text)
  }
  const cancel = () => {
    if (finished.current) return
    finished.current = true
    onCancel()
  }

  return (
    <input
      ref={ref}
      className="tree__rename"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') cancel()
      }}
      onBlur={commit}
    />
  )
}
