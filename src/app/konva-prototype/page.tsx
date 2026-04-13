import KonvaTemplatePrototype from '@/components/prototypes/KonvaTemplatePrototype'

export default function KonvaPrototypePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #f5f7fb 0%, #eef2f7 100%)',
        color: '#111827',
        padding: '32px 20px 48px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: 1440 }}>
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              borderRadius: 999,
              border: '1px solid rgba(17, 24, 39, 0.12)',
              background: 'rgba(255,255,255,0.7)',
              padding: '8px 12px',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Konva Prototype
          </div>
          <h1 style={{ margin: '16px 0 8px', fontSize: 32, lineHeight: 1.1 }}>
            Guardrailed template editing for Payload-driven graphics
          </h1>
          <p style={{ margin: 0, maxWidth: 960, color: '#4b5563', fontSize: 16, lineHeight: 1.6 }}>
            This prototype is intentionally scoped to content-user edits, not template authoring.
            It shows the degree of control users can have without letting them break the layout:
            swap a headshot, pull in a post title, override the copy, crop the image, reposition
            the title block inside safe bounds, adjust width and alignment, and export a PNG.
          </p>
        </div>
        <KonvaTemplatePrototype />
      </div>
    </main>
  )
}
