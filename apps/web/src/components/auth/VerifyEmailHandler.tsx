'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

type Status = 'verifying' | 'success' | 'error'

export function VerifyEmailHandler() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setTokens = useAuthStore((s) => s.setTokens)
  const [status, setStatus] = useState<Status>('verifying')
  const [error, setError] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setStatus('error')
      setError('Link invalid — lipsește tokenul de confirmare.')
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
        const err = e as { response?: { data?: { message?: string } } }
        setStatus('error')
        setError(err.response?.data?.message ?? 'Confirmarea a eșuat')
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
      {status === 'verifying' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Se confirmă emailul...</h1>
          <p className="text-gray-500 text-sm">Un moment, te rugăm.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Cont activat!</h1>
          <p className="text-gray-500 text-sm">Te redirecționăm către proiectele tale...</p>
        </>
      )}

      {status === 'error' && (
        <>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirmare eșuată</h1>
          <p className="text-red-600 text-sm mb-4">{error}</p>
          <Link href="/login" className="text-brand-500 font-medium hover:text-brand-600">
            Înapoi la autentificare
          </Link>
        </>
      )}
    </div>
  )
}
