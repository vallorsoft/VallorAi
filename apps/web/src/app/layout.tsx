import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from './providers'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: { default: 'AI Home Designer', template: '%s | AI Home Designer' },
  description: 'Proiectează-ți casa visurilor cu ajutorul inteligenței artificiale',
  keywords: ['proiectare casa', 'arhitectura AI', 'plan casa', 'designer interior'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
