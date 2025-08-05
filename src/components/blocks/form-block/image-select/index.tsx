import type { Control, FieldErrorsImpl } from 'react-hook-form'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import Image from 'next/image'
import React from 'react'
import { Controller } from 'react-hook-form'

import { Error } from '../error'
import { Width } from '../width'

interface MediaType {
  url?: string
  alt?: string
}

interface ImageSelectOption {
  label: string
  value: string
  image?: MediaType | string
}

interface ImageSelectField {
  blockName?: string
  blockType: 'image-select'
  label?: string
  name: string
  options: ImageSelectOption[]
  required?: boolean
  allowMultiple?: boolean
  width?: number
}

export const ImageSelect: React.FC<
  ImageSelectField & {
    control: Control
    errors: Partial<FieldErrorsImpl>
  }
> = ({ name, control, errors, label, options, required, allowMultiple, width }) => {
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
            <div id={name} className="flex flex-col space-y-2">
              {options.map(({ label: optionLabel, value: optionValue, image }) => {
                const checked = Array.isArray(value) && value.includes(optionValue)
                const imgURL = typeof image === 'object' && image && 'url' in image ? image.url : undefined
                return (
                  <label key={optionValue} className="flex items-center space-x-2">
                    {imgURL && (
                      <Image
                        src={imgURL}
                        alt={optionLabel || ''}
                        width={64}
                        height={64}
                        className="h-16 w-16 object-cover"
                      />
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
                    <span>{optionLabel}</span>
                  </label>
                )
              })}
            </div>
          ) : (
            <RadioGroup onValueChange={onChange} value={value} id={name} className="flex flex-col space-y-2">
              {options.map(({ label: optionLabel, value: optionValue, image }) => {
                const imgURL = typeof image === 'object' && image && 'url' in image ? image.url : undefined
                return (
                  <label key={optionValue} className="flex items-center space-x-2">
                    {imgURL && (
                      <Image
                        src={imgURL}
                        alt={optionLabel || ''}
                        width={64}
                        height={64}
                        className="h-16 w-16 object-cover"
                      />
                    )}
                    <RadioGroupItem value={optionValue} />
                    <span>{optionLabel}</span>
                  </label>
                )
              })}
            </RadioGroup>
          )
        )}
        rules={{ required }}
      />
      {errors[name] && <Error />}
    </Width>
  )
}

