'use client'

import { usePathname } from 'next/navigation'
import { useTranslation } from '@/lib/useTranslation'
import { LanguageSwitcher } from './LanguageSwitcher'

interface TopBarProps {
  onMenuClick: () => void
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()

  const titles: Record<string, string> = {
    '/projects': t.nav.projects,
    '/marketplace': t.nav.marketplace,
    '/settings': t.nav.settings,
  }
  const title = Object.entries(titles).find(([k]) => pathname.startsWith(k))?.[1] ?? t.common.appName

  return (
    <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between gap-3 px-4 sm:px-6">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label={t.sidebar.openMenu}
          className="md:hidden p-1.5 -ml-1.5 rounded-lg text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h2 className="text-sm font-medium text-gray-700 truncate">{title}</h2>
      </div>
      <LanguageSwitcher />
    </header>
  )
}
