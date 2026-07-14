import React, { Suspense } from 'react'

import { PostGraphicEditorLauncher } from '@/components/admin/graphics/PostGraphicEditorLauncher'

export default function GraphicsEditorStandalonePage() {
  return (
    <Suspense fallback={null}>
      <PostGraphicEditorLauncher />
    </Suspense>
  )
}
