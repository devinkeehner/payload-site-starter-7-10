import React, { Suspense } from 'react'

import { PostGraphicEditorLauncher } from '@/components/admin/graphics/PostGraphicEditorLauncher'

export default function GraphicsEditorPage() {
  return (
    <Suspense fallback={null}>
      <PostGraphicEditorLauncher />
    </Suspense>
  )
}
