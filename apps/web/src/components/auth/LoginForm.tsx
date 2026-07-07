'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useTranslation } from '@/lib/useTranslation'

export function LoginForm() {
  const router = useRouter()
  const setTokens = useAuthStore((s) => s.setTokens)
  const { t } = useTranslation()
  const [error, setError] = useState('')
  const [unverifiedEmail, setUnverifiedEmail] = useState('')
  const [resent, setResent] = useState(false)

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().email(t.validation.emailInvalid),
        password: z.string().min(1, t.validation.passwordRequired),
      }),
    [t],
  )
  type FormData = z.infer<typeof schema>

  const { register, handleSubmit, getValues, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    setUnverifiedEmail('')
    setResent(false)
    try {
      const res = await api.post('/auth/login', data)
      setTokens(res.data.accessToken, res.data.refreshToken)
      router.push('/projects')
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } }
      if (err.response?.status === 403) {
        setUnverifiedEmail(getValues('email'))
        setError(err.response?.data?.error?.message ?? t.auth.login.unverified)
      } else {
        setError(t.auth.login.wrongCredentials)
      }
    }
  }

  const resendVerification = async () => {
    try {
      await api.post('/auth/resend-verification', { email: unverifiedEmail })
      setResent(true)
    } catch {
      setResent(false)
    }
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.login.title}</h1>
      <p className="text-gray-500 text-sm mb-8">{t.auth.login.subtitle}</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.login.emailLabel}</label>
          <input
            {...register('email')}
            type="email"
            placeholder={t.auth.login.emailPlaceholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{t.auth.login.passwordLabel}</label>
          <input
            {...register('password')}
            type="password"
            placeholder={t.auth.login.passwordPlaceholder}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-red-600 text-sm">
            {error}
            {unverifiedEmail && !resent && (
              <button
                type="button"
                onClick={resendVerification}
                className="block mt-1 text-brand-600 font-medium hover:text-brand-700"
              >
                {t.auth.login.resendVerification}
              </button>
            )}
            {resent && <p className="mt-1 text-green-600">{t.auth.login.resent}</p>}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-brand-500 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? t.auth.login.submitting : t.auth.login.submit}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        {t.auth.login.noAccount}{' '}
        <Link href="/register" className="text-brand-500 font-medium hover:text-brand-600">
          {t.auth.login.registerLink}
        </Link>
      </p>
    </div>
  )
}
