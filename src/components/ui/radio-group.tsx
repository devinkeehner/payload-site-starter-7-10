'use client'

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group'
import { Circle } from 'lucide-react'
import React from 'react'
import { cn } from '@/lib/utils'

const RadioGroup = RadioGroupPrimitive.Root

const RadioGroupItem: React.FC<
  { ref?: React.Ref<HTMLButtonElement> } & React.ComponentProps<typeof RadioGroupPrimitive.Item>
> = ({ className, ref, children, ...props }) => (
  <RadioGroupPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square h-4 w-4 rounded-full border border-primary text-primary-foreground shadow focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary',
      className,
    )}
    {...props}
  >
    <RadioGroupPrimitive.Indicator className="flex items-center justify-center">
      {children || <Circle className="h-2.5 w-2.5 fill-current" />}
    </RadioGroupPrimitive.Indicator>
  </RadioGroupPrimitive.Item>
)

export { RadioGroup, RadioGroupItem }
