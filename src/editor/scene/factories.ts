import * as THREE from 'three'
import type { MenuItem } from '../ui/ContextMenu'
import { addObject } from './operations'

const defaultMaterial = () =>
  new THREE.MeshStandardMaterial({ color: 0x9aa3b2, roughness: 0.5, metalness: 0.1 })

interface Factory {
  label: string
  create: () => THREE.Object3D
}

/** Everything the "Add" menu can spawn, grouped by separators. */
const FACTORIES: (Factory | 'separator')[] = [
  {
    label: 'Box',
    create: () => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMaterial())
      m.position.y = 0.5
      return m
    },
  },
  {
    label: 'Sphere',
    create: () => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 16), defaultMaterial())
      m.position.y = 0.5
      return m
    },
  },
  {
    label: 'Cylinder',
    create: () => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 32), defaultMaterial())
      m.position.y = 0.5
      return m
    },
  },
  {
    label: 'Plane',
    create: () => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), defaultMaterial())
      m.rotation.x = -Math.PI / 2
      m.material.side = THREE.DoubleSide
      return m
    },
  },
  'separator',
  { label: 'Group (Empty)', create: () => new THREE.Group() },
  'separator',
  {
    label: 'Directional Light',
    create: () => {
      const l = new THREE.DirectionalLight(0xffffff, 1.2)
      l.position.set(3, 5, 2)
      return l
    },
  },
  {
    label: 'Point Light',
    create: () => {
      const l = new THREE.PointLight(0xffffff, 8, 0, 2)
      l.position.set(0, 2, 0)
      return l
    },
  },
]

/** Build menu items that spawn objects via {@link addObject}. */
export function createMenuItems(): MenuItem[] {
  return FACTORIES.map((f) =>
    f === 'separator'
      ? { separator: true }
      : { label: f.label, onClick: () => addObject(f.create, f.label) },
  )
}
