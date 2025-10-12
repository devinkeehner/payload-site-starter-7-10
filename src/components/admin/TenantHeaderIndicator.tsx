"use client"

import React, { useEffect, useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { useConfig } from "@payloadcms/ui"

import { TenantBreadcrumbBar } from "./TenantBreadcrumbBar"
import { useActiveTenant } from "./hooks/useActiveTenant"

interface CollectionMeta {
  slug: string
  label: string
  useAsTitle?: string
}

const resolveCollectionLabel = (collection?: CollectionMeta | null, fallback?: string) => {
  if (!collection) return fallback
  return collection.label || fallback || collection.slug
}

const resolveNestedValue = (obj: any, path?: string) => {
  if (!obj || !path) return undefined
  return path.split(".").reduce((acc, key) => (acc ? acc[key] : undefined), obj)
}

const getCollectionMeta = (collections: any[] | undefined, slug: string | undefined): CollectionMeta | null => {
  if (!slug || !collections) return null
  const found = collections.find((c) => c?.slug === slug)
  if (!found) return null
  const label = found?.labels?.plural || found?.labels?.singular || slug
  return { slug, label, useAsTitle: found?.admin?.useAsTitle }
}

const ensureTenantSelectorInteractive = () => {
  const field = document.getElementById("field-setTenant")
  if (!field) return

  field.classList.remove("read-only")

  const wrappers = field.querySelectorAll<HTMLElement>(
    ".react-select, .rs__control, .rs__option, .rs__single-value"
  )
  wrappers.forEach((el) => {
    el.classList.remove("rs--is-disabled", "rs__control--is-disabled", "rs__single-value--is-disabled")
    el.removeAttribute("aria-disabled")
    el.removeAttribute("data-disabled")
  })

  const input = field.querySelector<HTMLInputElement>("input.rs__input")
  if (input) {
    input.removeAttribute("disabled")
  }
}

const TenantHeaderIndicator: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()
  const { config } = useConfig()
  useActiveTenant() // ensure hook runs to keep cache warm, even if header only needs tenant info indirectly

  const [collectionLabel, setCollectionLabel] = useState<string | undefined>(undefined)
  const [collectionHref, setCollectionHref] = useState<string | undefined>(undefined)
  const [docLabel, setDocLabel] = useState<string | undefined>(undefined)
  const [docKey, setDocKey] = useState<string | undefined>(undefined)

  const collections = useMemo(() => config?.collections || [], [config])

  useEffect(() => {
    if (typeof document === "undefined") return

    ensureTenantSelectorInteractive()

    const observer = new MutationObserver(() => ensureTenantSelectorInteractive())
    observer.observe(document.body, { childList: true, subtree: true })
    window.addEventListener("payload:locationchange", ensureTenantSelectorInteractive)

    return () => {
      observer.disconnect()
      window.removeEventListener("payload:locationchange", ensureTenantSelectorInteractive)
    }
  }, [])

  useEffect(() => {
    const raw = pathname || ""
    const withoutAdmin = raw.replace(/^\/admin/, "").replace(/^\/+/, "")
    const segments = withoutAdmin.split("/").filter(Boolean)

    if (segments.length === 0) {
      setCollectionLabel(undefined)
      setCollectionHref(undefined)
      setDocLabel(undefined)
      setDocKey(undefined)
      return
    }

    if (segments[0] === "collections" && segments[1]) {
      const collectionSlug = segments[1]
      const meta = getCollectionMeta(collections, collectionSlug)
      setCollectionLabel(resolveCollectionLabel(meta, collectionSlug))
      setCollectionHref(`/admin/collections/${collectionSlug}`)

      const potentialDoc = segments[2]

      if (!potentialDoc) {
        setDocLabel(undefined)
        setDocKey(undefined)
        return
      }

      if (potentialDoc === "create") {
        setDocLabel("Create")
        setDocKey(undefined)
        return
      }

      if (["trash", "versions", "api"].includes(potentialDoc)) {
        setDocLabel(undefined)
        setDocKey(undefined)
        return
      }

      const docId = potentialDoc
      setDocLabel(docId)
      setDocKey(`${collectionSlug}:${docId}`)
      return
    }

    setCollectionLabel(undefined)
    setCollectionHref(undefined)
    setDocLabel(undefined)
    setDocKey(undefined)
  }, [pathname, collections])

  useEffect(() => {
    if (!docKey) return

    const [collectionSlug, docId] = docKey.split(":")
    const meta = getCollectionMeta(collections, collectionSlug)
    if (!meta) return

    const controller = new AbortController()
    let cancelled = false

    const fetchDoc = async () => {
      try {
        const res = await fetch(`/api/${collectionSlug}/${docId}?depth=0`, {
          credentials: "include",
          signal: controller.signal,
        })
        if (!res.ok) throw new Error("Failed to load document")
        const json = await res.json()
        if (cancelled) return

        let derived = resolveNestedValue(json, meta.useAsTitle)
        if (typeof derived !== "string" || !derived.trim()) {
          derived = json?.title || json?.name || json?.slug || docId
        }
        setDocLabel(String(derived))
      } catch (err) {
        if (!cancelled) {
          setDocLabel(docId)
        }
      }
    }

    fetchDoc()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [docKey, collections])

  return (
    <>
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 90,
          background: "var(--theme-elevation-0)",
          borderBottom: "1px solid var(--theme-elevation-100)",
          padding: "1.25rem clamp(1rem, 3vw, 2rem) 1rem",
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
          pointerEvents: "none",
        }}
      >
        <div style={{ pointerEvents: "auto" }}>
          <TenantBreadcrumbBar
            collectionLabel={collectionLabel}
            collectionHref={collectionHref}
            docLabel={docLabel}
          />
        </div>
      </div>
      {children}
    </>
  )
}

export default TenantHeaderIndicator
