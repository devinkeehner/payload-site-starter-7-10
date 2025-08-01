import React from 'react'

export const Width: React.FC<{
  children: React.ReactNode
  width?: number
}> = ({ children, width }) => {
  if (width) {
    return (
      <div className="w-full" style={{ maxWidth: `${width}%` }}>
        <div className="space-y-2">{children}</div>
      </div>
    )
  }

  return <div className="w-full space-y-2">{children}</div>
}
