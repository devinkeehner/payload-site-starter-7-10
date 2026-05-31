import type { Block } from 'payload'

const nameField = (defaultValue: string) => ({
  name: 'name',
  type: 'text' as const,
  label: 'Name',
  required: true,
  defaultValue,
})

const labelField = (defaultValue: string) => ({
  name: 'label',
  type: 'text' as const,
  label: 'Label',
  defaultValue,
})

const widthField = {
  name: 'width',
  type: 'number' as const,
  label: 'Width',
  defaultValue: 100,
}

const requiredField = {
  name: 'required',
  type: 'checkbox' as const,
  label: 'Required',
  defaultValue: false,
}

const defaultTextField = {
  name: 'defaultValue',
  type: 'text' as const,
  label: 'Default Value',
}

const optionFields = [
  {
    name: 'label',
    type: 'text' as const,
    label: 'Label',
    required: true,
    defaultValue: 'Option',
  },
  {
    name: 'value',
    type: 'text' as const,
    label: 'Value',
    required: true,
    defaultValue: 'option',
  },
]

const choiceOptionsField = (label: string) => ({
  name: 'options',
  type: 'array' as const,
  label,
  minRows: 1,
  defaultValue: [
    { label: 'First option', value: 'first' },
    { label: 'Second option', value: 'second' },
  ],
  fields: optionFields,
})

const baseFieldBlock = (
  slug: string,
  singular: string,
  defaults: { label: string; name: string },
  extraFields: Block['fields'] = [],
): Block => ({
  slug,
  fields: [
    nameField(defaults.name),
    labelField(defaults.label),
    widthField,
    ...extraFields,
    requiredField,
  ],
  labels: {
    plural: `${singular} Fields`,
    singular,
  },
})

export const FORM_FIELD_BLOCKS: Block[] = [
  baseFieldBlock('text', 'Text', { label: 'Text field', name: 'textField' }, [defaultTextField]),
  baseFieldBlock('textarea', 'Textarea', { label: 'Long answer', name: 'longAnswer' }, [defaultTextField]),
  baseFieldBlock('email', 'Email', { label: 'Email address', name: 'email' }),
  baseFieldBlock('number', 'Number', { label: 'Number', name: 'number' }, [
    {
      name: 'defaultValue',
      type: 'number',
      label: 'Default Value',
    },
  ]),
  baseFieldBlock('select', 'Select', { label: 'Select one', name: 'selectOne' }, [
    defaultTextField,
    {
      name: 'placeholder',
      type: 'text',
      label: 'Placeholder',
      defaultValue: 'Choose an option',
    },
    choiceOptionsField('Select Options'),
  ]),
  baseFieldBlock('radio', 'Radio', { label: 'Choose one', name: 'chooseOne' }, [
    defaultTextField,
    choiceOptionsField('Radio Options'),
  ]),
  baseFieldBlock('checkbox', 'Checkbox', { label: 'Checkbox', name: 'checkbox' }, [
    {
      name: 'defaultValue',
      type: 'checkbox',
      label: 'Checked by default',
      defaultValue: false,
    },
  ]),
  baseFieldBlock('checkbox-group', 'Checkbox Group', { label: 'Select all that apply', name: 'checkboxGroup' }, [
    choiceOptionsField('Checkbox Options'),
  ]),
  baseFieldBlock('state', 'State', { label: 'State', name: 'state' }),
  baseFieldBlock('country', 'Country', { label: 'Country', name: 'country' }),
  {
    slug: 'message',
    fields: [
      {
        name: 'message',
        type: 'richText',
        label: 'Message',
      },
    ],
    labels: {
      plural: 'Message Blocks',
      singular: 'Message',
    },
  },
  baseFieldBlock('image-select', 'Image Select', { label: 'Choose an image', name: 'imageSelect' }, [
    {
      name: 'allowMultiple',
      type: 'checkbox',
      label: 'Allow Multiple Selections',
      defaultValue: false,
    },
    {
      name: 'options',
      type: 'array',
      label: 'Options',
      minRows: 1,
      defaultValue: [
        { label: 'First option', value: 'first' },
        { label: 'Second option', value: 'second' },
      ],
      fields: [
        ...optionFields,
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          label: 'Image',
        },
      ],
    },
  ]),
  baseFieldBlock('video-capture', 'Video Capture', { label: 'Record a video', name: 'video' }, [
    {
      name: 'maxDuration',
      type: 'number',
      label: 'Max Duration',
      defaultValue: 60,
    },
    {
      name: 'maxFileSizeMB',
      type: 'number',
      label: 'Max File Size MB',
      defaultValue: 100,
    },
    {
      name: 'mimeTypes',
      type: 'array',
      label: 'Allowed MIME Types',
      fields: [
        {
          name: 'mimeType',
          type: 'text',
          label: 'MIME Type',
          defaultValue: 'video/webm',
          required: true,
        },
      ],
    },
    {
      name: 'helpText',
      type: 'textarea',
      label: 'Helper Text',
    },
  ]),
]
