'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { api } from '@/lib/api'

const schema = z.object({
  name: z.string().min(2, 'Numele trebuie să aibă minim 2 caractere'),
  email: z.string().email('Email invalid'),
  password: z.string().min(8, 'Parola trebuie să aibă minim 8 caractere'),
})

type FormData = z.infer<typeof schema>

export function RegisterForm() {
  const [error, setError] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setError('')
    try {
      await api.post('/auth/register', { ...data, language: 'ro', country: 'RO' })
      setSubmitted(true)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } }
      setError(err?.response?.data?.message ?? 'Înregistrare eșuată')
    }
  }

  if (submitted) {
    return (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Verifică-ți emailul</h1>
        <p className="text-gray-500 text-sm">
          Ți-am trimis un link de confirmare. Deschide-l pentru a-ți activa contul și a te putea autentifica.
        </p>
      </div>
    )
  }

  return (
    <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Creează cont gratuit</h1>
      <p className="text-gray-500 text-sm mb-8">Proiectează prima ta casă cu ajutorul AI</p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nume complet</label>
          <input
            {...register('name')}
            type="text"
            placeholder="Ion Popescu"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            {...register('email')}
            type="email"
            placeholder="tu@exemplu.ro"
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Parolă</label>
          <input
            {...register('password')}
            type="password"
            placeholder="Minim 8 caractere"
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
          {isSubmitting ? 'Se creează contul...' : 'Creează cont'}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Ai deja cont?{' '}
        <Link href="/login" className="text-brand-500 font-medium hover:text-brand-600">
          Autentifică-te
        </Link>
      </p>
    </div>
  )
}
