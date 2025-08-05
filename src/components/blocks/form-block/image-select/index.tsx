import type { Control, FieldErrorsImpl } from 'react-hook-form'
import type { Media } from '@/payload-types'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ImageMedia } from '@/components/site/media/image-media'
import React from 'react'
import { Controller } from 'react-hook-form'

import { Error } from '../error'
import { Width } from '../width'

interface ImageSelectOption {
  label: string
  value: string
  image?: Media | number
}

interface ImageSelectField {
  blockName?: string
  blockType: 'image-select'
  name: string
  label?: string
  options: ImageSelectOption[]
  required?: boolean
  width?: number
  allowMultiple?: boolean
}

export const ImageSelect: React.FC<
  ImageSelectField & {
    control: Control
    errors: Partial<FieldErrorsImpl>
  }
> = ({ name, control, errors, label, options, required, width, allowMultiple }) => {
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
        defaultValue={allowMultiple ? [] : ''}
        name={name}
        render={({ field: { onChange, value } }) => (
          allowMultiple ? (
            <div id={name} className="flex flex-wrap gap-4">
              {options.map(({ label, value: optionValue, image }) => {
                const checked = Array.isArray(value) && value.includes(optionValue)
                return (
                  <label key={optionValue} className="flex flex-col items-center space-y-2">
                    {image && typeof image === 'object' && (
                      <ImageMedia resource={image} imgClassName="h-24 w-24 object-cover rounded-md" />
                    )}
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
          ) : (
            <RadioGroup id={name} value={value} onValueChange={onChange} className="flex flex-wrap gap-4">
              {options.map(({ label, value: optionValue, image }) => (
                <label key={optionValue} className="flex flex-col items-center space-y-2">
                  {image && typeof image === 'object' && (
                    <ImageMedia resource={image} imgClassName="h-24 w-24 object-cover rounded-md" />
                  )}
                  <RadioGroupItem value={optionValue} />
                  <span>{label}</span>
                </label>
              ))}
            </RadioGroup>
          )
        )}
        rules={{ required }}
      />
      {errors[name] && <Error />}
    </Width>
  )
}

