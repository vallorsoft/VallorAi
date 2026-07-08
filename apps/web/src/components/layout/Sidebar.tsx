'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/useTranslation'
import { useCurrentUser } from '@/hooks/useCurrentUser'

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname = usePathname()
  const logout = useAuthStore((s) => s.logout)
  const router = useRouter()
  const { t } = useTranslation()
  const { data: currentUser } = useCurrentUser()

  const navItems = [
    { href: '/projects', label: t.sidebar.projects, icon: '🏠' },
    { href: '/marketplace', label: t.sidebar.marketplace, icon: '🛒' },
    { href: '/settings', label: t.sidebar.settings, icon: '⚙️' },
    ...(currentUser?.role === 'SUPERADMIN'
      ? [{ href: '/admin/ai-settings', label: t.adminAiSettings.title, icon: '' }]
      : []),
  ]

  const handleLogout = () => {
    logout()
    router.push('/login')
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-gray-100 flex flex-col transform transition-transform duration-200 md:static md:z-auto md:translate-x-0 md:transition-none ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
              <span className="text-white font-bold text-xs">AI</span>
            </div>
            <span className="font-semibold text-gray-900 text-sm">{t.common.appName}</span>
          </div>
          <button
            onClick={onClose}
            aria-label={t.sidebar.closeMenu}
            className="md:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
          >
            <span>🚪</span>
            {t.sidebar.logout}
          </button>
        </div>
      </aside>
    </>
  )
}
