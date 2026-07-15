"use client"

import React, { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useConfig } from "@payloadcms/ui"

import { TenantBreadcrumbBar } from "./TenantBreadcrumbBar"
import TenantNavPanel from "./TenantNavPanel"
import { useActiveTenant } from "./hooks/useActiveTenant"

import './tenant-admin-header.scss'

interface CollectionMeta {
  slug: string
  label: string
  useAsTitle?: string
}

type CollectionConfigShape = {
  slug?: string
  labels?: { plural?: string; singular?: string }
  admin?: { useAsTitle?: string }
}

const resolveCollectionLabel = (collection?: CollectionMeta | null, fallback?: string) => {
  if (!collection) return fallback
  return collection.label || fallback || collection.slug
}

const resolveNestedValue = (obj: Record<string, unknown> | null | undefined, path?: string) => {
  if (!obj || !path) return undefined
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, obj)
}

const getCollectionMeta = (collections: CollectionConfigShape[] | undefined, slug: string | undefined): CollectionMeta | null => {
  if (!slug || !collections) return null
  const found = collections.find((c) => c?.slug === slug)
  if (!found) return null
  const label = found?.labels?.plural || found?.labels?.singular || slug
  return { slug, label, useAsTitle: found?.admin?.useAsTitle }
}

const ensureTenantSelectorInteractive = () => {
  const field = document.getElementById("field-setTenant")
  if (!field) return

  field.classList.remove("read-only", "field-type--readOnly")

  const wrappers = field.querySelectorAll<HTMLElement>(
    ".react-select, .rs__control, .rs__value-container, .rs__option, .rs__single-value, .rs__menu, .rs__indicators"
  )

  wrappers.forEach((el) => {
    el.classList.remove(
      "rs--is-disabled",
      "rs__control--is-disabled",
      "rs__single-value--is-disabled",
      "rs__option--is-disabled",
      "react-select__control--is-disabled"
    )
    el.removeAttribute("aria-disabled")
    el.removeAttribute("data-disabled")
    el.removeAttribute("aria-readonly")
    if (el.tabIndex === -1) {
      el.tabIndex = 0
    }
    if (el.style.pointerEvents === "none") {
      el.style.pointerEvents = "auto"
    }
    if (el.style.opacity === "0.5") {
      el.style.opacity = ""
    }
  })

  const disabledAttrs = field.querySelectorAll<HTMLElement>(
    "[aria-disabled='true'], [data-disabled='true'], [aria-readonly='true'], [readonly]"
  )
  disabledAttrs.forEach((el) => {
    el.removeAttribute("aria-disabled")
    el.removeAttribute("data-disabled")
    el.removeAttribute("aria-readonly")
    el.removeAttribute("readonly")
    if (el instanceof HTMLInputElement || el instanceof HTMLButtonElement) {
      el.disabled = false
    }
  })

  const input = field.querySelector<HTMLInputElement>("input.rs__input")
  if (input) {
    input.removeAttribute("disabled")
    input.removeAttribute("aria-readonly")
    input.readOnly = false
  }
}

const formatVisitHref = (slug?: string | null) => {
  if (!slug) return undefined
  const base = process.env.NEXT_PUBLIC_SERVER_URL
  if (base) {
    return `${base.replace(/\/$/, '')}/${slug}`
  }
  return `/${slug}`
}

const TenantHeaderIndicator: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()
  const { config } = useConfig()
  const { tenant, tenantID, tenantName } = useActiveTenant()

  const [collectionLabel, setCollectionLabel] = useState<string | undefined>(undefined)
  const [collectionHref, setCollectionHref] = useState<string | undefined>(undefined)
  const [docLabel, setDocLabel] = useState<string | undefined>(undefined)
  const [docKey, setDocKey] = useState<string | undefined>(undefined)
  const [isHydrated, setIsHydrated] = useState(false)

  const collections = useMemo<CollectionConfigShape[]>(() => (config?.collections || []) as CollectionConfigShape[], [config])
  const isDashboard = (pathname || '').replace(/\/+$/, '') === '/admin'

  const tenantSlug = tenant?.slug || tenantID || undefined
  const visitHref = useMemo(() => {
    if (!isHydrated) return undefined
    return formatVisitHref(tenantSlug)
  }, [isHydrated, tenantSlug])
  useEffect(() => {
    setIsHydrated(true)
  }, [])

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
    const params = new URLSearchParams(window.location.search)
    const requestedTab = params.get('hroTab')?.trim()
    const requestedField = params.get('hroField')?.trim()
    if (!requestedTab) return

    let finished = false
    let attempts = 0

    const focusTarget = () => {
      if (requestedField) {
        document.getElementById(requestedField)?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }

    const openRequestedTab = () => {
      if (finished || attempts >= 20) return
      attempts += 1

      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>('.tabs-field__tab-button'),
      )
      const target = buttons.find((button) => button.textContent?.trim() === requestedTab)
      if (!target) return

      finished = true
      if (target.getAttribute('aria-selected') !== 'true') target.click()
      window.requestAnimationFrame(focusTarget)
    }

    openRequestedTab()
    if (finished) return

    const observer = new MutationObserver(openRequestedTab)
    observer.observe(document.body, { childList: true, subtree: true })

    const timer = window.setInterval(() => {
      openRequestedTab()
      if (finished || attempts >= 20) {
        window.clearInterval(timer)
        observer.disconnect()
      }
    }, 150)

    return () => {
      window.clearInterval(timer)
      observer.disconnect()
    }
  }, [pathname])

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
      } catch (_err) {
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
      <div className="hro-admin-header" data-hro-tenant-header="true">
        <div className="hro-admin-header__inner">
          <div className="hro-admin-header__workspace">
            <TenantBreadcrumbBar
              collectionLabel={isDashboard ? undefined : collectionLabel}
              collectionHref={isDashboard ? undefined : collectionHref}
              docLabel={isDashboard ? undefined : docLabel}
              tenantSelector={<TenantNavPanel selectedTenantID={tenantID} variant="header" />}
            />
          </div>
          <div className="hro-admin-header__actions">
            {isHydrated && (visitHref || tenantName) && (
              <a
                className="hro-admin-header__action"
                href={visitHref || undefined}
                target={visitHref ? "_blank" : undefined}
                rel={visitHref ? "noreferrer" : undefined}
              >
                <span className="hro-admin-header__action-label--desktop">View website</span>
                <span aria-hidden="true" className="hro-admin-header__action-label--mobile">Visit</span>
              </a>
            )}
            <Link
              aria-label="Account settings"
              className="hro-admin-header__action hro-admin-header__action--account"
              href="/admin/account"
            >
              Account
            </Link>
          </div>
        </div>
      </div>
      {children}
    </>
  )
}

export default TenantHeaderIndicator
