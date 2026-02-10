'use client'

import React from 'react'

const FormSubmissionCooldownNotice: React.FC = () => {
  return (
    <div style={{ fontSize: '0.875rem', lineHeight: '1.4' }}>
      <strong>Cooldown policy</strong>
      <p style={{ marginTop: '0.35rem' }}>
        After 3 submissions from the same email or IP within 15 minutes, submissions are blocked for 15 minutes.
        Each additional lockout adds 30 minutes.
      </p>
      <p style={{ marginTop: '0.35rem' }}>
        Exemptions: FORM_SUBMISSION_COOLDOWN_EXEMPT_IPS and FORM_SUBMISSION_COOLDOWN_EXEMPT_EMAIL_DOMAINS.
      </p>
    </div>
  )
}

export { FormSubmissionCooldownNotice }
