import React from 'react'
import { DEBUFF_ICONS } from '@shared/constants'

interface Props {
  type: string
  className?: string
}

export default function DebuffIcon({ type, className = 'w-5 h-5' }: Props) {
  const icon = DEBUFF_ICONS[type]
  if (!icon) return null
  if (icon.startsWith('/')) {
    return <img src={icon} alt={type} className={`inline-block object-contain ${className}`} />
  }
  return <span>{icon}</span>
}
