import { describe, expect, it } from 'vitest'

import {
  createLexicalText,
  getLexicalPlainText,
  normalizeFormSettings,
} from './formSettings'

describe('form settings helpers', () => {
  it('round-trips a confirmation message through Lexical data', () => {
    const message = 'Thanks! Your response has been received.'
    expect(getLexicalPlainText(createLexicalText(message))).toBe(message)
  })

  it('normalizes required form metadata without changing behavior flags', () => {
    expect(normalizeFormSettings({
      confirmationMessage: '  Done  ',
      confirmationType: 'message',
      enableHoneypot: true,
      enableTurnstile: false,
      redirectURL: '  /thank-you  ',
      submitButtonLabel: '   ',
      title: '  Contact form  ',
    })).toEqual({
      confirmationMessage: 'Done',
      confirmationType: 'message',
      enableHoneypot: true,
      enableTurnstile: false,
      redirectURL: '/thank-you',
      submitButtonLabel: 'Submit',
      title: 'Contact form',
    })
  })
})

