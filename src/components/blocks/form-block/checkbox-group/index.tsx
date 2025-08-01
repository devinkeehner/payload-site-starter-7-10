import type { SelectFieldOption } from '@payloadcms/plugin-form-builder/types'
import type { Control, FieldErrorsImpl } from 'react-hook-form'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import React from 'react'
import { Controller } from 'react-hook-form'

import { Error } from '../error'
import { Width } from '../width'

interface CheckboxGroupField {
  blockName?: string
  blockType: 'checkbox-group'
  defaultValue?: string[]
  label?: string
  name: string
  options: SelectFieldOption[]
  required?: boolean
  width?: number
}

export const CheckboxGroup: React.FC<
  CheckboxGroupField & {
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
        defaultValue={[]}
        name={name}
        render={({ field: { onChange, value } }) => (
          <div id={name} className="flex flex-col space-y-2">
            {options.map(({ label, value: optionValue }) => {
              const checked = Array.isArray(value) && value.includes(optionValue)
              return (
                <label key={optionValue} className="flex items-center space-x-2">
                  <Checkbox
                    id={`${name}-${optionValue}`}
                    checked={checked}
                    onCheckedChange={(isChecked) => {
                      if (Array.isArray(value)) {
                        if (isChecked) onChange([...value, optionValue])
                        else onChange(value.filter((v) => v !== optionValue))
                      } else {
                        onChange(isChecked ? [optionValue] : [])
                      }
                    }}
                  />
                  <span>{label}</span>
                </label>
              )
            })}
          </div>
        )}
        rules={{ required }}
      />
      {errors[name] && <Error />}
    </Width>
  )
}
