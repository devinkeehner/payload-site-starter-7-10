'use client'

import React from 'react'

type Props = {
  children: React.ReactNode
  loadingLabel: string
}

type State = {
  error: Error | null
  isReloading: boolean
}

const isChunkLoadError = (error: Error) =>
  /chunk|dynamically imported module|failed to fetch/i.test(`${error.name} ${error.message}`)

const getRetryKey = () => `hro-puck-chunk-retry:${window.location.pathname}`

export class PuckBuilderLoadBoundary extends React.Component<Props, State> {
  private clearRetryTimer?: number

  override state: State = {
    error: null,
    isReloading: false,
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      error,
      isReloading: false,
    }
  }

  override componentDidMount() {
    this.clearRetryTimer = window.setTimeout(() => {
      if (!this.state.error) {
        window.sessionStorage.removeItem(getRetryKey())
      }
    }, 60_000)
  }

  override componentDidCatch(error: Error) {
    if (!isChunkLoadError(error)) return

    try {
      const retryKey = getRetryKey()
      if (window.sessionStorage.getItem(retryKey) === '1') return
      window.sessionStorage.setItem(retryKey, '1')
    } catch {
      // A blocked sessionStorage should not prevent the recovery reload.
    }

    this.setState({ isReloading: true })
    window.setTimeout(() => window.location.reload(), 500)
  }

  override componentWillUnmount() {
    if (this.clearRetryTimer) {
      window.clearTimeout(this.clearRetryTimer)
    }
  }

  private retry = () => {
    try {
      window.sessionStorage.removeItem(getRetryKey())
    } catch {
      // Reloading still works if sessionStorage is unavailable.
    }
    window.location.reload()
  }

  override render() {
    if (!this.state.error) return this.props.children

    if (this.state.isReloading) {
      return <div style={{ padding: 24 }}>{this.props.loadingLabel}</div>
    }

    return (
      <div role="alert" style={{ padding: 24 }}>
        <p>The builder could not finish loading.</p>
        <button onClick={this.retry} type="button">
          Retry builder
        </button>
      </div>
    )
  }
}
