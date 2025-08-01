'use client'

import { Section, Container } from '@/components/layout'
import { Button } from '@/components/ui/button'

import { useForm, FormProvider } from 'react-hook-form'
import { useCallback, useState, useEffect } from 'react'
import { getClientSideURL } from '@/lib/utilities/getURL'
import { useRouter } from 'next/navigation'
import { fields } from './fields'

import RichText from '@/components/site/rich-text'

import type { FormFieldBlock, Form as FormType } from '@payloadcms/plugin-form-builder/types'
import type { SerializedEditorState } from '@payloadcms/richtext-lexical/lexical'

export type FormBlockType = {
  blockName?: string
  blockType?: 'formBlock'
  enableIntro: boolean
  form: FormType
  introContent?: SerializedEditorState
}

export function FormBlock(props: { id?: string } & FormBlockType) {
  const {
    enableIntro,
    form: formFromProps,
    form: { id: formID, confirmationMessage, confirmationType, redirect, submitButtonLabel } = {},
    introContent,
  } = props

  const [isMounted, setIsMounted] = useState(false)
  const formMethods = useForm({
    defaultValues: formFromProps.fields,
    mode: 'onTouched',
  })
  const {
    control,
    formState: { errors },
    handleSubmit,
    register,
  } = formMethods

  const [isLoading, setIsLoading] = useState(false)
  const [hasSubmitted, setHasSubmitted] = useState<boolean>()
  const [error, setError] = useState<{ message: string; status?: string } | undefined>()
  const router = useRouter()

  useEffect(() => {
    setIsMounted(true)
  }, [])

  const onSubmit = useCallback(
    (data: FormFieldBlock[]) => {
      let loadingTimerID: ReturnType<typeof setTimeout>
      const submitForm = async () => {
        setError(undefined)

        const dataToSend = Object.entries(data).map(([name, value]) => ({
          field: name,
          value,
        }))

        // delay loading indicator by 1s
        loadingTimerID = setTimeout(() => {
          setIsLoading(true)
        }, 1000)

        try {
          const req = await fetch(`${getClientSideURL()}/api/form-submissions`, {
            body: JSON.stringify({
              form: formID,
              submissionData: dataToSend,
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          })

          const res = await req.json()

          clearTimeout(loadingTimerID)

          if (req.status >= 400) {
            setIsLoading(false)
            setError({
              message:
                res.errors?.[0]?.message ||
                'There was an error submitting the form. Please try again.',
              status: res.status,
            })
            return
          }

          setIsLoading(false)
          setHasSubmitted(true)

          if (confirmationType === 'redirect' && redirect) {
            const { url } = redirect
            if (url) {
              // Add a small delay before redirect to show success state
              setTimeout(() => {
                router.push(url)
              }, 1000)
            }
          }
        } catch (err) {
          console.warn(err)
          setIsLoading(false)
          setError({
            message: 'Unable to submit form. Please check your connection and try again.',
          })
        }
      }

      void submitForm()
    },
    [router, formID, redirect, confirmationType],
  )

  if (!isMounted) {
    return null
  }

  return (
    <Section>
      <Container>
        {enableIntro && introContent && !hasSubmitted && (
          <RichText className="mb-8 lg:mb-12" data={introContent} enableGutter={false} />
        )}
        <div className="p-6 lg:p-8 border rounded-sm bg-card">
          <FormProvider {...formMethods}>
            {!hasSubmitted && (
              <form id={formID} onSubmit={handleSubmit(onSubmit)} className="space-y-8">
                <div className="grid gap-8">
                  {formFromProps &&
                    formFromProps.fields &&
                    formFromProps.fields?.map((field, index) => {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const Field: React.FC<any> = fields?.[field.blockType as keyof typeof fields]
                      if (Field) {
                        return (
                          <div key={index} className="animate-in fade-in-50">
                            <Field
                              form={formFromProps}
                              {...field}
                              {...formMethods}
                              control={control}
                              errors={errors}
                              register={register}
                            />
                          </div>
                        )
                      }
                      return null
                    })}
                </div>
                <div className="flex justify-start">
                  <Button
                    form={formID}
                    type="submit"
                    variant="default"
                    className="min-w-[120px]"
                    disabled={isLoading}
                  >
                    {isLoading ? 'Submitting...' : submitButtonLabel}
                  </Button>
                </div>
              </form>
            )}
            {!isLoading && hasSubmitted && confirmationType === 'message' && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-md animate-in fade-in-50">
                <RichText data={confirmationMessage} />
              </div>
            )}
            {isLoading && !hasSubmitted && (
              <div className="flex items-center justify-center p-8 animate-in fade-in-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Submitting form...</span>
              </div>
            )}
            {error && (
              <div className="p-4 mb-6 bg-red-50 border border-red-200 rounded-md animate-in fade-in-50">
                <p className="text-red-700">{error.message}</p>
              </div>
            )}
          </FormProvider>
        </div>
      </Container>
    </Section>
  )
}
