import { Metadata } from 'next'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = { title: 'Înregistrare' }

export default function RegisterPage() {
  return <RegisterForm />
}
