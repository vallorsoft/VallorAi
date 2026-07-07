'use client'

import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/useTranslation'
import { LanguageSwitcher } from './LanguageSwitcher'

export function TopBar() {
  const pathname = usePathname()
  const { t } = useTranslation()

  const titles: Record<string, string> = {
    '/projects': t.nav.projects,
    '/marketplace': t.nav.marketplace,
    '/settings': t.nav.settings,
  }
  const title = Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] ?? t.common.appName

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-6">
      <h2 className="text-sm font-medium text-gray-700">{title}</h2>
      <LanguageSwitcher />
    </header>
  )
}
