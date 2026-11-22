import { useFrame } from '@react-three/fiber'
import { useRef, type ReactNode } from 'react'
import { MathUtils, type Group } from 'three'
import type { PlaceholderKind } from '../../../api/types'
import { Fortress, Monument, Settlement, Stupa } from './architecture'
import { GOLD } from './common'
import { Lake, Lakes, Peak, Range, Reservoir, Road } from './nature'

export function Plinth({ children }: { children?: ReactNode }) {
  return (
    <group>
      <mesh position-y={-0.2} receiveShadow>
        <cylinderGeometry args={[4.2, 4.4, 0.4, 96]} />
        <meshStandardMaterial color="#121a36" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.05, 4.15, 96]} />
        <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position-y={0.002} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[4.05, 96]} />
        <meshStandardMaterial color="#1a2347" roughness={0.9} />
      </mesh>
      {children}
    </group>
  )
}

export function PlaceholderModel({ kind, variant }: { kind: PlaceholderKind; variant?: 'restored' | 'ruins' }) {
  const ruins = variant === 'ruins'
  const group = useRef<Group>(null)
  // Gentle "grow" animation on mount; callers pass a `key` so it replays when the era changes.
  const grow = useRef(0)
  useFrame((_, dt) => {
    grow.current = MathUtils.damp(grow.current, 1, 4, dt)
    if (group.current) group.current.scale.set(1, grow.current, 1)
  })
  const content = (() => {
    switch (kind) {
      case 'fortress':
        return <Fortress ruins={ruins} />
      case 'settlement':
        return <Settlement ruins={ruins} />
      case 'lake':
        return <Lake />
      case 'lakes':
        return <Lakes />
      case 'reservoir':
        return <Reservoir />
      case 'peak':
        return <Peak />
      case 'road':
        return <Road />
      case 'range':
        return <Range />
      case 'stupa':
        return <Stupa ruins={ruins} />
      case 'monument':
      default:
        return <Monument />
    }
  })()
  return (
    <group ref={group} scale-y={0}>
      {content}
    </group>
  )
}
