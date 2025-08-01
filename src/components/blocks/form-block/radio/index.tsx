import type { SelectFieldOption } from '@payloadcms/plugin-form-builder/types'
import type { Control, FieldErrorsImpl } from 'react-hook-form'

import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import React from 'react'
import { Controller } from 'react-hook-form'

import { Error } from '../error'
import { Width } from '../width'

interface RadioField {
  blockName?: string
  blockType: 'radio'
  defaultValue?: string
  label?: string
  name: string
  options: SelectFieldOption[]
  placeholder?: string
  required?: boolean
  width?: number
}

export const Radio: React.FC<
  RadioField & {
    control: Control
    errors: Partial<FieldErrorsImpl>
  }
> = ({ name, control, errors, label, options, required, width }) => {
  return (
    <Width width={width}>
      <Label className="mb-2" htmlFor={name}>
        {label}
        {required && (
          <span className="required">
            * <span className="sr-only">(required)</span>
          </span>
        )}
      </Label>
      <Controller
        control={control}
        defaultValue=""
        name={name}
        render={({ field: { onChange, value } }) => (
          <RadioGroup onValueChange={onChange} value={value} id={name} className="flex flex-col space-y-2">
            {options.map(({ label, value }) => (
              <label key={value} className="flex items-center space-x-2">
                <RadioGroupItem value={value} />
                <span>{label}</span>
              </label>
            ))}
          </RadioGroup>
        )}
        rules={{ required }}
      />
      {errors[name] && <Error />}
    </Width>
  )
}
