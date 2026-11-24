'use client'

import { useEffect, useRef, useState } from 'react'

import { getMailPDFStem, mailPDFNameHeader } from '@/lib/mail-tool/filename'

import styles from './mail-tool.module.css'

type SaveResult =
  | { status: 'saving' }
  | { status: 'failed'; message: string }
  | { status: 'saved'; downloadURL: string; expiresAt: Date | null }

const saveFailure = 'Could not save a shareable link. You can still download your PDF here.'

export default function MailToolClient() {
  const [mode, setMode] = useState<'combined' | 'separate'>('combined')
  const [combined, setCombined] = useState<File | null>(null)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [downloadURL, setDownloadURL] = useState('')
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  const [copyResult, setCopyResult] = useState<{ url: string; message: string } | null>(null)
  const resultURL = useRef('')
  const activeRequest = useRef<AbortController | null>(null)
  const pdfStem = getMailPDFStem((mode === 'combined' ? combined : front)?.name)
  const pdfFilename = `${pdfStem}.pdf`

  useEffect(() => () => {
    activeRequest.current?.abort()
    if (resultURL.current) URL.revokeObjectURL(resultURL.current)
  }, [])

  function clearResult() {
    activeRequest.current?.abort()
    activeRequest.current = null
    if (resultURL.current) URL.revokeObjectURL(resultURL.current)
    resultURL.current = ''
    setDownloadURL('')
    setSaveResult(null)
    setCopyResult(null)
    setError('')
    setWarnings([])
  }

  function changeMode(next: 'combined' | 'separate') {
    clearResult()
    setCombined(null)
    setFront(null)
    setBack(null)
    setMode(next)
  }

  async function savePDF(pdf: Blob, signal: AbortSignal) {
    setSaveResult({ status: 'saving' })

    try {
      const response = await fetch('/api/mail-tool/pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/pdf',
          [mailPDFNameHeader]: encodeURIComponent(pdfStem),
        },
        credentials: 'same-origin',
        body: pdf,
        signal,
      })
      if (!response.ok) {
        if (!signal.aborted) setSaveResult({
          status: 'failed',
          message: response.status === 413
            ? 'This PDF is too large to save online. You can still download it here.'
            : saveFailure,
        })
        return
      }
      const data = await response.json() as { downloadUrl?: unknown; expiresAt?: unknown } | null
      if (
        typeof data?.downloadUrl !== 'string' || !data.downloadUrl ||
        (typeof data.expiresAt !== 'string' && data.expiresAt !== null)
      ) {
        throw new Error('The download link is missing.')
      }
      if (new URL(data.downloadUrl).protocol !== 'https:') throw new Error('The download link is invalid.')
      const expiresAt = data.expiresAt === null ? null : new Date(data.expiresAt)
      if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('The download link expiry is invalid.')
      if (!signal.aborted) setSaveResult({ status: 'saved', downloadURL: data.downloadUrl, expiresAt })
    } catch {
      if (!signal.aborted) setSaveResult({ status: 'failed', message: saveFailure })
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopyResult({ url, message: 'Download link copied.' })
    } catch {
      setCopyResult({ url, message: 'Could not copy automatically. Copy the address of the download link.' })
    }
  }

  async function generate(event: React.FormEvent) {
    event.preventDefault()
    clearResult()
    if (mode === 'combined' ? !combined : !front || !back) return
    const request = new AbortController()
    activeRequest.current = request
    setBusy(true)
    try {
      const { createMailPDF } = await import('@/lib/mail-tool/createMailPDF')
      const result = await createMailPDF(mode === 'combined'
        ? { mode, file: combined! }
        : { mode, front: front!, back: back! })
      if (request.signal.aborted) return
      const pdf = new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' })
      const url = URL.createObjectURL(pdf)
      resultURL.current = url
      setDownloadURL(url)
      setWarnings(result.warnings)
      void savePDF(pdf, request.signal)
    } catch (err) {
      if (!request.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Could not create the PDF. Please try again.')
      }
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }

  return (
    <main className={styles.tool}>
      <header>
        <p className={styles.eyebrow}>Design / Print preparation</p>
        <h1>Mail Tool</h1>
        <p>Turn your front and back artwork into a two-sided, two-up PDF, ready to print and cut.</p>
      </header>
      <div className={styles.columns}>
        <form onSubmit={generate} className={styles.card}>
          <h2>Upload your artwork</h2>
          <p>PDF is preferred to keep text and graphics sharp. Export from Canva at <strong>8 × 5 inches</strong>, with no bleed or crop marks. Maximum 50 MB per file.</p>
          <fieldset key={mode} disabled={busy} className={styles.fields}>
            <legend>Choose your files</legend>
            <label className={styles.option}>
              <input type="radio" name="mail-input" checked={mode === 'combined'} onChange={() => changeMode('combined')} />
              One two-page PDF <span>Front on page 1, back on page 2</span>
            </label>
            <label className={styles.option}>
              <input type="radio" name="mail-input" checked={mode === 'separate'} onChange={() => changeMode('separate')} />
              Separate front and back <span>One-page PDFs, JPEGs, or PNGs</span>
            </label>
            {mode === 'combined' ? (
              <label className={styles.file}>Front and back PDF
                <input type="file" accept=".pdf,application/pdf" onChange={(event) => { clearResult(); setCombined(event.target.files?.[0] || null) }} required />
              </label>
            ) : (
              <>
                <label className={styles.file}>Front artwork
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { clearResult(); setFront(event.target.files?.[0] || null) }} required />
                </label>
                <label className={styles.file}>Back artwork
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(event) => { clearResult(); setBack(event.target.files?.[0] || null) }} required />
                </label>
              </>
            )}
          </fieldset>
          <button className={styles.button} disabled={busy || (mode === 'combined' ? !combined : !front || !back)} type="submit">{busy ? 'Preparing PDF…' : 'Create print PDF'}</button>
          <p className={styles.note}>Your original artwork stays in your browser. The finished PDF is saved for download.</p>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <div aria-live="polite">
            {downloadURL ? <div className={styles.result}>
              <strong>Your two-page PDF is ready.</strong>
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
              {saveResult?.status === 'saved' ? (
                <>
                  <div className={styles.resultActions}>
                    <a className={styles.button} href={saveResult.downloadURL} download={pdfFilename}>Download print PDF</a>
                    <button className={`${styles.button} ${styles.secondary}`} onClick={() => void copyLink(saveResult.downloadURL)} type="button">Copy link</button>
                  </div>
                  {saveResult.expiresAt ? (
                    <p className={styles.note}>Link expires {saveResult.expiresAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</p>
                  ) : null}
                  {copyResult?.url === saveResult.downloadURL ? <p>{copyResult.message}</p> : null}
                </>
              ) : (
                <>
                  <a className={styles.button} href={downloadURL} download={pdfFilename}>Download print PDF</a>
                  {saveResult?.status === 'saving' ? <p className={styles.note}>Saving a shareable download link…</p> : null}
                  {saveResult?.status === 'failed' ? <p className={styles.error}>{saveResult.message}</p> : null}
                </>
              )}
            </div> : null}
          </div>
        </form>
        <aside className={styles.card}>
          <h2>Two copies, each side</h2>
          <p>US Letter · 8.5 × 11 inches · Portrait</p>
          <div className={styles.sheet} role="img" aria-label="Letter sheet: two 8 by 5 inch designs, quarter-inch outside margins and quarter-inch margins above and below the center cut.">
            <div className={styles.artwork}>8 × 5″<small>Front / back</small></div>
            <div className={styles.artwork}>8 × 5″<small>Same design</small></div>
            <span className={styles.cut}>Cut at 5.5″</span>
          </div>
          <p><strong>¼ inch of space on every edge</strong>, including above and below the center cut. Page 1 has two fronts. Page 2 has two backs.</p>
          <p>Print at <strong>100% / Actual size</strong> on Letter cardstock, double-sided with <strong>flip on long edge</strong>. Cut horizontally at 5.5 inches.</p>
          <p className={styles.note}>Print a test sheet first to check your printer’s duplex alignment. The download has no bleed or printed cut line.</p>
        </aside>
      </div>
    </main>
  )
}
