import type { EmailField } from '@payloadcms/plugin-form-builder/types'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import React from 'react'

import { Error } from '../error'
import { Width } from '../width'

export const Email: React.FC<
  EmailField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
  }
> = ({ name, defaultValue, errors, label, register, required, width }) => {
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/
  const errorMessage =
    errors[name]?.type === 'pattern'
      ? 'Please enter a valid email address'
      : errors[name]?.type === 'required'
        ? 'Email is required'
        : undefined

  return (
    <Width width={width}>
      <div className="relative">
        <Label htmlFor={name} className="text-sm font-medium">
          {label}
          {required && (
            <span className="text-red-500 ml-0.5">
              * <span className="sr-only">(required)</span>
            </span>
          )}
        </Label>
        <div className="relative mt-1">
          <Input
            defaultValue={defaultValue}
            id={name}
            type="email"
            placeholder="Enter your email"
            autoComplete="email"
            className={`transition-colors duration-200 ${
              errors[name]
                ? 'border-red-500 focus-visible:ring-red-500 focus-visible:ring-1'
                : 'focus-visible:ring-primary'
            }`}
            {...register(name, {
              required,
              pattern: emailPattern,
            })}
          />
        </div>
        {errors[name] && <Error message={errorMessage} />}
      </div>
    </Width>
  )
}
