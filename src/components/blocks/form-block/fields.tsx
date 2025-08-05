import { Checkbox } from './checkbox'
import { Country } from './country'
import { Email } from './email'
import { Message } from './message'
import { Number } from './number'
import { Radio } from './radio'
import { CheckboxGroup } from './checkbox-group'
import { Select } from './select'
import { State } from './state'
import { Text } from './text'
import { Textarea } from './textarea'
import { ImageSelect } from './image-select'

export const fields = {
  checkbox: Checkbox,
  country: Country,
  email: Email,
  message: Message,
  number: Number,
  radio: Radio,
  'checkbox-group': CheckboxGroup,
  'image-select': ImageSelect,
  select: Select,
  state: State,
  text: Text,
  textarea: Textarea,
}