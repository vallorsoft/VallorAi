'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/useTranslation'

export function RegisterForm() {
  const { t, locale } = useTranslation()
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, t.validation.nameMin),
        email: z.string().email(t.validation.emailInvalid),
        password: z.string().min(8, t.validation.passwordMin),
      }),
    [t],
  )
  type FormData = z.infer<typeof schema>

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await api.post('/auth/register', { ...data, language: locale, country: 'RO' })
      setSubmitted(true)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: { message?: string } } } }
      setError(err?.response?.data?.error?.message ?? t.auth.register.genericError)
    }
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.register.checkEmailTitle}</h1>
        <p className="text-gray-500 text-sm">{t.auth.register.checkEmailBody}</p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.register.title}</h1>
      <p className="text-gray-500 text-sm mb-8">{t.auth.register.subtitle}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.register.nameLabel}</label>
          <input
            {...register('name')}
            type="text"
            placeholder={t.auth.register.namePlaceholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.register.emailLabel}</label>
          <input
            {...register('email')}
            type="email"
            placeholder={t.auth.register.emailPlaceholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.register.passwordLabel}</label>
          <input
            {...register('password')}
            type="password"
            placeholder={t.auth.register.passwordPlaceholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-600 text-sm">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t.auth.register.submitting : t.auth.register.submit}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        {t.auth.register.hasAccount}{' '}
        <Link href="/login" className="text-brand-500 font-medium hover:text-brand-600">
          {t.auth.register.loginLink}
        </Link>
      </p>
    </div>
  )
}
