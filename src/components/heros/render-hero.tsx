import React from 'react'

import type { Page } from '@/payload-types'

type HeroProps = NonNullable<Page['hero']>

import { HighImpactHero } from '@/components/heros/high-impact'
import { LowImpactHero } from '@/components/heros/low-impact'
import { MediumImpactHero } from '@/components/heros/medium-impact'

const heroes: Record<NonNullable<Page['hero']>['type'], React.FC<HeroProps>> = {
  highImpact: HighImpactHero,
  lowImpact: LowImpactHero,
  mediumImpact: MediumImpactHero,
}

export const RenderHero: React.FC<Page['hero']> = (props) => {
  const { type } = props || {}

  if (!type || type === 'none') return null

  const HeroToRender = heroes[type]

  if (!HeroToRender) return null

  return <HeroToRender {...(props as HeroProps)} />
}
