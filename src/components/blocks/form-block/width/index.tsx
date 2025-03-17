import React from 'react'

export const Width: React.FC<{
  children: React.ReactNode
  width?: number
}> = ({ children, width }) => {
  if (width) {
    return (
      <div className="w-full" style={{ maxWidth: `${width}%` }}>
        {children}
      </div>
    )
  }

  return <div className="w-full">{children}</div>
}
