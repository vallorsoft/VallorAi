'use client'

import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAdminStats } from '@/hooks/useAdmin'
import { useTranslation } from '@/lib/useTranslation'
import Link from 'next/link'

export function AdminDashboard() {
  const { t } = useTranslation()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const { data: stats, isLoading: statsLoading } = useAdminStats()

  if (userLoading) return null

  if (currentUser?.role !== 'SUPERADMIN') {
    return <div className="p-6 text-gray-500 text-sm">{t.admin.accessDenied}</div>
  }

  const statItems = [
    { label: t.admin.statsUsers, value: stats?.userCount },
    { label: t.admin.statsProjects, value: stats?.projectCount },
    { label: t.admin.statsHouses, value: stats?.houseCount },
    { label: t.admin.statsMaterials, value: stats?.materialCount },
  ]

  return (
    <div className="p-4 sm:p-6 max-w-4xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">{t.admin.dashboardTitle}</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8 mt-4">
        {statItems.map((item) => (
          <div key={item.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-2xl font-bold text-gray-900">
              {statsLoading ? '—' : (item.value ?? 0)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link
          href="/admin/users"
          className="bg-white rounded-xl border border-gray-100 p-4 hover:border-brand-200 hover:bg-brand-50 transition-colors"
        >
          <p className="font-semibold text-gray-900 text-sm">{t.admin.navUsers}</p>
          <p className="text-xs text-gray-500 mt-1">{t.admin.usersTitle}</p>
        </Link>
        <Link
          href="/admin/ai-settings"
          className="bg-white rounded-xl border border-gray-100 p-4 hover:border-brand-200 hover:bg-brand-50 transition-colors"
        >
          <p className="font-semibold text-gray-900 text-sm">{t.admin.navAiSettings}</p>
          <p className="text-xs text-gray-500 mt-1">{t.adminAiSettings.description}</p>
        </Link>
      </div>
    </div>
  )
}
