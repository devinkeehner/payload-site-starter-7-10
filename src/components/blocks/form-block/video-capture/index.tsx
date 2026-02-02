'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FieldErrorsImpl, FieldValues, UseFormRegister } from 'react-hook-form'
import { useFormContext } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

import { Error as FieldError } from '../error'
import { Width } from '../width'

type MimeTypeConfig = {
  mimeType: string
}

type VideoCaptureField = {
  blockName?: string
  blockType: 'video-capture'
  label?: string
  name: string
  required?: boolean
  width?: number
  helpText?: string
  maxDuration?: number | null
  maxFileSizeMB?: number | null
  mimeTypes?: MimeTypeConfig[] | null
  form?: {
    id?: string
    tenant?: string | { id?: string | null }
  }
}

type UploadResponse = {
  url: string
  key?: string
  size?: number
  mimeType?: string
  duration?: number
}

type StoredValue = {
  url: string
  key?: string
  size?: number
  mimeType?: string
  duration?: number
  uploadedAt?: string
}

const DEFAULT_ALLOWED_MIME_TYPES = ['video/webm', 'video/mp4']

export const VideoCapture: React.FC<
  VideoCaptureField & {
    errors: Partial<FieldErrorsImpl>
    register: UseFormRegister<FieldValues>
  }
> = ({
  name,
  label,
  required,
  width,
  helpText,
  maxDuration,
  maxFileSizeMB,
  mimeTypes,
  errors,
  register,
  form,
}) => {
  const { setValue, clearErrors, watch } = useFormContext()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [recording, setRecording] = useState(false)
  const [recorderError, setRecorderError] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [recordedDuration, setRecordedDuration] = useState<number | null>(null)
  const value = watch(name) as StoredValue | undefined

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaStreamRef = useRef<MediaStream | null>(null)
  const recordStartRef = useRef<number | null>(null)
  const livePreviewRef = useRef<HTMLVideoElement | null>(null)
  const [showLivePreview, setShowLivePreview] = useState(false)

  const allowedMimeTypes = useMemo(() => {
    const provided = (mimeTypes || [])
      .map((item) => (typeof item?.mimeType === 'string' ? item.mimeType.trim() : ''))
      .filter(Boolean)
    return provided.length ? provided : DEFAULT_ALLOWED_MIME_TYPES
  }, [mimeTypes])

  useEffect(() => {
    const subscription = watch((data, { name: fieldName }) => {
      if (fieldName === name) {
        const next = data?.[fieldName] as StoredValue | undefined
        if (next?.url) {
          setPreviewUrl(next.url)
        }
      }
    })
    return () => subscription.unsubscribe()
  }, [name, watch])

  useEffect(() => {
    register(name, {
      required,
      validate: (val: StoredValue) => {
        if (!required) return true
        if (val && typeof val === 'object' && typeof val.url === 'string' && val.url.length > 0) return true
        return 'Video is required.'
      },
    })
  }, [name, register, required])

  useEffect(() => {
    if (blob) {
      const url = URL.createObjectURL(blob)
      setPreviewUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    }
    return undefined
  }, [blob])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      mediaStreamRef.current = null
    }
    if (livePreviewRef.current) {
      livePreviewRef.current.srcObject = null
    }
    setShowLivePreview(false)
    setRecording(false)
  }, [])

  useEffect(() => {
    return () => {
      stopRecording()
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop())
      }
    }
  }, [stopRecording])

  const startRecording = useCallback(async () => {
    setRecorderError(null)
    setUploadError(null)
    setRecordedDuration(null)

    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      setRecorderError('Video recording is not supported in this environment.')
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setRecorderError('Camera access is not supported on this device.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true },
      })
      mediaStreamRef.current = stream

      const recorderMimePreference = [
        'video/webm;codecs=vp8,opus',
        'video/mp4',
        'video/webm',
      ]

      const mimeType = [...recorderMimePreference, ...allowedMimeTypes].find((candidate) => {
        if (typeof MediaRecorder === 'undefined') return false
        if (!candidate) return false
        return MediaRecorder.isTypeSupported(candidate)
      })

      const options = mimeType
        ? {
            mimeType,
            audioBitsPerSecond: 128_000,
            videoBitsPerSecond: 2_500_000,
          }
        : undefined
      const recorder = new MediaRecorder(stream, options)
      const chunks: BlobPart[] = []
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data)
        }
      }

      recorder.onstop = () => {
        const recorded = new Blob(chunks, { type: recorder.mimeType || mimeType || 'video/webm' })
        const durationMs = recordStartRef.current ? Date.now() - recordStartRef.current : null
        const durationSeconds = durationMs ? Math.round(durationMs / 1000) : null
        setRecordedDuration(durationSeconds)
        setBlob(recorded)
        recordStartRef.current = null
        if (durationSeconds && maxDuration && durationSeconds > maxDuration) {
          setRecorderError(`Recording is too long. Limit is ${maxDuration} seconds.`)
        }
      }

      recorder.onerror = (event) => {
        console.error('MediaRecorder error', event)
        setRecorderError('An error occurred while recording. Please try again.')
      }

      setShowLivePreview(true)
      if (livePreviewRef.current) {
        livePreviewRef.current.srcObject = stream
        void livePreviewRef.current.play().catch(() => {
          /* ignore autoplay failures */
        })
      }

      recorder.start()
      recordStartRef.current = Date.now()
      setRecording(true)
      setBlob(null)
    } catch (err) {
      console.error('Unable to start recording', err)
      setRecorderError('Unable to access camera or microphone. Please check permissions and try again.')
    }
  }, [allowedMimeTypes, maxDuration])

  const resetRecording = useCallback(() => {
    setBlob(null)
    setPreviewUrl(value?.url ?? null)
    setRecordedDuration(null)
    setRecorderError(null)
    setUploadError(null)
    if (livePreviewRef.current) {
      livePreviewRef.current.srcObject = null
    }
    setShowLivePreview(false)
  }, [value?.url])

  const handleFileSelection = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setRecorderError(null)
      setUploadError(null)
      const file = event.target.files?.[0]
      if (!file) return
      if (allowedMimeTypes.length && !allowedMimeTypes.includes(file.type)) {
        setRecorderError('Selected file type is not allowed for this field.')
        return
      }
      setBlob(file)
      setRecordedDuration(null)
    },
    [allowedMimeTypes],
  )

  const handleUpload = useCallback(async () => {
    if (!blob) {
      setUploadError('Please record or choose a video before uploading.')
      return
    }

    if (maxDuration && recordedDuration && recordedDuration > maxDuration) {
      setUploadError(`Recorded video exceeds the ${maxDuration}-second limit.`)
      return
    }

    const maxBytes = maxFileSizeMB ? maxFileSizeMB * 1024 * 1024 : null
    if (maxBytes && blob.size > maxBytes) {
      setUploadError(`Video exceeds the ${maxFileSizeMB} MB size limit.`)
      return
    }

    const uploadUrl = process.env.NEXT_PUBLIC_FORM_VIDEO_UPLOAD_URL || '/api/form-uploads/video'
    const uploadToken = process.env.NEXT_PUBLIC_FORM_VIDEO_UPLOAD_TOKEN

    const extension = (() => {
      const type = blob.type || 'video/webm'
      const match = type.match(/\/([a-z0-9]+)$/i)
      return match ? match[1] : 'webm'
    })()

    const filename = `${name}-${Date.now()}.${extension}`
    const fileForUpload = blob instanceof File ? blob : new File([blob], filename, { type: blob.type || 'video/webm' })

    const formData = new FormData()
    formData.append('file', fileForUpload)
    formData.append('fieldName', name)

    if (recordedDuration !== null) {
      formData.append('duration', String(recordedDuration))
    }

    if (form?.id) {
      formData.append('formId', String(form.id))
    }

    const tenantID = typeof form?.tenant === 'string' ? form?.tenant : form?.tenant?.id
    if (tenantID) {
      formData.append('tenant', tenantID)
    }

    setIsUploading(true)
    setUploadError(null)

    try {
      const headers: HeadersInit = {}
      if (uploadToken) {
        headers['x-form-upload-token'] = uploadToken
      }

      const response = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
        headers,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Upload failed with status ${response.status}`)
      }

      const json = (await response.json()) as UploadResponse
      if (!json?.url) {
        throw new Error('Upload succeeded but no URL was returned.')
      }

      const payload: StoredValue = {
        url: json.url,
        key: json.key,
        size: json.size ?? blob.size,
        mimeType: json.mimeType ?? blob.type,
        duration: json.duration ?? recordedDuration ?? undefined,
        uploadedAt: new Date().toISOString(),
      }

      setValue(name, payload, { shouldDirty: true, shouldTouch: true })
      clearErrors(name)
      setBlob(null)
      setRecordedDuration(null)
      setUploadError(null)
    } catch (err) {
      console.error('Video upload failed', err)
      setUploadError(err instanceof Error ? err.message : 'Failed to upload video.')
    } finally {
      setIsUploading(false)
    }
  }, [blob, clearErrors, form?.id, form?.tenant, maxDuration, maxFileSizeMB, name, recordedDuration, setValue])

  const handleRemove = useCallback(() => {
    setValue(name, undefined, { shouldDirty: true, shouldTouch: true })
    setBlob(null)
    setRecordedDuration(null)
    setPreviewUrl(null)
    setUploadError(null)
    setRecorderError(null)
  }, [name, setValue])

  const renderPreview = () => {
    const src = blob ? previewUrl : value?.url || previewUrl
    if (!src) return null

    return (
      <video
        key={src}
        src={src}
        controls
        className="mt-3 w-full rounded border"
        playsInline
        preload="metadata"
      />
    )
  }

  return (
    <Width width={width}>
      <Label className="mb-2 block" htmlFor={`${name}-video`}>
        {label}
        {required && (
          <span className="required">
            * <span className="sr-only">(required)</span>
          </span>
        )}
      </Label>

      {helpText && <p className="text-sm text-muted-foreground mb-3">{helpText}</p>}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="default" onClick={recording ? stopRecording : startRecording}>
            {recording ? 'Stop recording' : 'Record video'}
          </Button>
          <Button type="button" variant="outline" onClick={resetRecording} disabled={!blob && !recording}>
            Reset
          </Button>
          <Button type="button" variant="secondary" onClick={handleUpload} disabled={!blob || isUploading}>
            {isUploading ? 'Uploading…' : 'Upload'}
          </Button>
          <Button type="button" variant="ghost" onClick={handleRemove} disabled={!value?.url && !blob}>
            Remove
          </Button>
        </div>

        <Input
          id={`${name}-video-file`}
          type="file"
          accept={allowedMimeTypes.join(',')}
          onChange={handleFileSelection}
        />

        <div className="rounded border bg-black/60 p-2" hidden={!showLivePreview}>
          <video
            ref={livePreviewRef}
            muted
            playsInline
            autoPlay
            className="h-48 w-full rounded object-cover"
            aria-label="Live recording preview"
            style={!showLivePreview ? { display: 'none' } : undefined}
          />
        </div>

        {recordedDuration !== null && (
          <p className="text-sm text-muted-foreground">Recorded duration: {recordedDuration} seconds</p>
        )}

        {renderPreview()}

        {recorderError && <p className="text-sm text-destructive">{recorderError}</p>}
        {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
        {errors[name] && !uploadError && !recorderError && <FieldError />}
      </div>
    </Width>
  )
}
