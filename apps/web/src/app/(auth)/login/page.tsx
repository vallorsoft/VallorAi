import { Metadata } from 'next'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = { title: 'Autentificare' }

export default function LoginPage() {
  return <LoginForm />
}
