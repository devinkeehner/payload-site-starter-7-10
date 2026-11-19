'use client'
import { Navbar } from '@/payload-types'
import { RowLabelProps, useRowLabel } from '@payloadcms/ui'

export const RowLabel: React.FC<RowLabelProps> = () => {
  const data = useRowLabel<NonNullable<Navbar['navItems']>[number]>()

  const label = data?.data?.link?.label || `Menu link ${(data?.rowNumber ?? 0) + 1}`

  return <div>{label}</div>
}
