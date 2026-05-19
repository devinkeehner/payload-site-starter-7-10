'use client'

import React from 'react'
import { $getSelection, $isRangeSelection } from 'lexical'
import { $patchStyleText } from '@lexical/selection'
import { createClientFeature } from '@payloadcms/richtext-lexical/client'

const COLOR_OPTIONS = [
  { label: 'Default', value: '' },
  { label: 'Black', value: '#0b0d12' },
  { label: 'White', value: '#ffffff' },
  { label: 'Primary', value: 'var(--tenant-primary, #0b1e3a)' },
  { label: 'Accent', value: 'var(--tenant-accent, #7a0012)' },
]

const TextColorIcon = ({ color }: { color?: string }) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 20 20"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M11.708 14.5H7.79785V13.9414H8.01367C9.00391 13.9414 9.15625 13.9033 9.15625 13.6113V6.70508H8.07715C6.82031 6.70508 6.73145 7.08594 6.28711 8.67285H5.80469L5.91895 6.12109H13.5869L13.7012 8.67285H13.2188C12.7744 7.08594 12.6855 6.70508 11.4287 6.70508H10.3496V13.6113C10.3496 13.9033 10.502 13.9414 11.4922 13.9414H11.708V14.5Z"
      fill={color || 'currentColor'}
    />
    {color && (
      <rect x="2" y="16" width="16" height="2" fill={color} />
    )}
  </svg>
)

export const TextColorFeatureClient = createClientFeature(() => {
  return {
    toolbarFixed: {
      groups: [
        {
          type: 'dropdown',
          ChildComponent: () => <TextColorIcon />,
          items: COLOR_OPTIONS.map((option) => ({
            key: `text-color-${option.label.toLowerCase()}`,
            label: option.label,
            ChildComponent: () => <TextColorIcon color={option.value || undefined} />,
            onSelect: ({ editor }) => {
              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  $patchStyleText(selection, { color: option.value || null })
                }
              })
            },
          })),
          key: 'text-color',
          order: 30,
        },
      ],
    },
    toolbarInline: {
      groups: [
        {
          type: 'dropdown',
          ChildComponent: () => <TextColorIcon />,
          items: COLOR_OPTIONS.map((option) => ({
            key: `text-color-${option.label.toLowerCase()}`,
            label: option.label,
            ChildComponent: () => <TextColorIcon color={option.value || undefined} />,
            onSelect: ({ editor }) => {
              editor.update(() => {
                const selection = $getSelection()
                if ($isRangeSelection(selection)) {
                  $patchStyleText(selection, { color: option.value || null })
                }
              })
            },
          })),
          key: 'text-color',
          order: 30,
        },
      ],
    },
  }
})
