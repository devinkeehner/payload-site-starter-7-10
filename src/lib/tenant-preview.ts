// Shared wire format with the CMS. A draft-mode cookie is not authorization.
export const TENANT_PREVIEW_COOKIE = "tenant-preview"
export const TENANT_PREVIEW_HEADER = "x-tenant-preview"
export const PREVIEW_TTL_SECONDS = 60 * 60 * 24

export type TenantPreview = {
  version: 1
  purpose: "tenant-preview"
  tenantId: string
  tenantSlug: string
  expiresAt: number
}

const encode = (bytes: Uint8Array) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")

const decode = (value: string) =>
  Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))

const keyFor = (secret: string) => crypto.subtle.importKey(
  "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"],
)

export async function createTenantPreview(
  tenant: { id: string; slug: string }, secret: string, now = Date.now(),
): Promise<string> {
  if (!secret || !tenant.id || !tenant.slug) throw new Error("Preview configuration missing")
  const grant: TenantPreview = {
    version: 1, purpose: "tenant-preview", tenantId: tenant.id, tenantSlug: tenant.slug,
    expiresAt: now + PREVIEW_TTL_SECONDS * 1000,
  }
  const body = encode(new TextEncoder().encode(JSON.stringify(grant)))
  const signature = await crypto.subtle.sign("HMAC", await keyFor(secret), new TextEncoder().encode(body))
  return `${body}.${encode(new Uint8Array(signature))}`
}

export async function verifyTenantPreview(
  token: string | undefined | null, secret: string | undefined, now = Date.now(),
): Promise<TenantPreview | null> {
  if (!token || !secret || token.length > 2048) return null
  try {
    const parts = token.split(".")
    if (parts.length !== 2) return null
    const [body, signature] = parts
    if (!body || !signature) return null
    const valid = await crypto.subtle.verify(
      "HMAC", await keyFor(secret), decode(signature), new TextEncoder().encode(body),
    )
    if (!valid) return null
    const grant = JSON.parse(new TextDecoder().decode(decode(body))) as TenantPreview
    return grant.version === 1 && grant.purpose === "tenant-preview" &&
      typeof grant.tenantId === "string" && !!grant.tenantId &&
      typeof grant.tenantSlug === "string" && !!grant.tenantSlug &&
      Number.isFinite(grant.expiresAt) && grant.expiresAt > now &&
      grant.expiresAt <= now + (PREVIEW_TTL_SECONDS + 60) * 1000 ? grant : null
  } catch { return null }
}
