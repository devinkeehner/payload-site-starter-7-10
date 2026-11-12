'use client'

import { useEffect, useRef, useState } from 'react'
import styles from './mail-tool.module.css'

export default function MailToolClient() {
  const [mode, setMode] = useState<'combined' | 'separate'>('combined')
  const [combined, setCombined] = useState<File | null>(null)
  const [front, setFront] = useState<File | null>(null)
  const [back, setBack] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [downloadURL, setDownloadURL] = useState('')
  const resultURL = useRef('')

  useEffect(() => () => { if (resultURL.current) URL.revokeObjectURL(resultURL.current) }, [])

  function clearResult() {
    if (resultURL.current) URL.revokeObjectURL(resultURL.current)
    resultURL.current = ''
    setDownloadURL('')
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

  async function generate(event: React.FormEvent) {
    event.preventDefault()
    clearResult()
    if (mode === 'combined' ? !combined : !front || !back) return
    setBusy(true)
    try {
      const { createMailPDF } = await import('@/lib/mail-tool/createMailPDF')
      const result = await createMailPDF(mode === 'combined'
        ? { mode, file: combined! }
        : { mode, front: front!, back: back! })
      const url = URL.createObjectURL(new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }))
      resultURL.current = url
      setDownloadURL(url)
      setWarnings(result.warnings)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the PDF. Please try again.')
    } finally {
      setBusy(false)
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
          <p className={styles.note}>Your files stay in your browser. Nothing is uploaded or saved to the site.</p>
          {error ? <p role="alert" className={styles.error}>{error}</p> : null}
          <div aria-live="polite">
            {downloadURL ? <div className={styles.result}>
              <strong>Your two-page PDF is ready.</strong>
              {warnings.map((warning) => <p key={warning}>{warning}</p>)}
              <a className={styles.button} href={downloadURL} download="mailer-two-up-letter.pdf">Download print PDF</a>
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
