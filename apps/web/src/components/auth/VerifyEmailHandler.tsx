'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useTranslation } from '@/lib/useTranslation'

type Status = 'verifying' | 'success' | 'error'

export function VerifyEmailHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setTokens = useAuthStore((s) => s.setTokens)
  const { t } = useTranslation()
  const [status, setStatus] = useState<Status>('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setError(t.auth.verifyEmail.invalidLink)
      return
    }

    api
      .post('/auth/verify-email', { token })
      .then((res) => {
        setTokens(res.data.accessToken, res.data.refreshToken)
        setStatus('success')
        setTimeout(() => router.push('/projects'), 1500)
      })
      .catch((e: unknown) => {
        const err = e as { response?: { data?: { error?: { message?: string } } } }
        setStatus('error')
        setError(err.response?.data?.error?.message ?? t.auth.verifyEmail.genericError)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      {status === 'verifying' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.verifyEmail.verifyingTitle}</h1>
          <p className="text-gray-500 text-sm">{t.auth.verifyEmail.verifyingBody}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.verifyEmail.successTitle}</h1>
          <p className="text-gray-500 text-sm">{t.auth.verifyEmail.successBody}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">{t.auth.verifyEmail.errorTitle}</h1>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <Link href="/login" className="text-brand-500 font-medium hover:text-brand-600">
            {t.auth.verifyEmail.backToLogin}
          </Link>
        </>
      )}
    </div>
  )
}
