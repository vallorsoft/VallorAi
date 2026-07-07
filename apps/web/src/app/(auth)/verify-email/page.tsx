import { Metadata } from 'next'
import { Suspense } from 'react'
import { VerifyEmailHandler } from '@/components/auth/VerifyEmailHandler'

export const metadata: Metadata = { title: 'Confirmare email' }

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailHandler />
    </Suspense>
  )
}
