'use client'

import { useState } from 'react'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { useAdminUsers, useSetUserRole, type AdminUser } from '@/hooks/useAdmin'
import { useTranslation } from '@/lib/useTranslation'

const ALL_ROLES = [
  'GUEST', 'USER', 'CLIENT', 'ARCHITECT', 'STRUCTURAL_ENGINEER',
  'MEP_ENGINEER', 'ELECTRICAL_ENGINEER', 'CONTRACTOR', 'MANUFACTURER',
  'SUPPLIER', 'ADMIN', 'SUPERADMIN',
] as const

export function AdminUsers() {
  const { t } = useTranslation()
  const { data: currentUser, isLoading: userLoading } = useCurrentUser()
  const { data, isLoading } = useAdminUsers()
  const setRole = useSetUserRole()
  const [saved, setSaved] = useState<string | null>(null)

  if (userLoading) return null
  if (currentUser?.role !== 'SUPERADMIN') {
    return <div className="p-6 text-gray-500 text-sm">{t.admin.accessDenied}</div>
  }

  const handleRoleChange = (user: AdminUser, role: string) => {
    setRole.mutate(
      { userId: user.id, role },
      {
        onSuccess: () => {
          setSaved(user.id)
          setTimeout(() => setSaved(null), 2000)
        },
      },
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">{t.admin.usersTitle}</h1>
      <p className="text-gray-500 text-sm mb-6">
        {isLoading ? t.admin.loading : `${data?.total ?? 0} total`}
      </p>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t.admin.userName}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t.admin.userEmail}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t.admin.userRole}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t.admin.userVerified}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">{t.admin.userCreated}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400 text-xs">
                    {t.admin.loading}
                  </td>
                </tr>
              )}
              {data?.users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{user.name}</td>
                  <td className="px-4 py-3 text-gray-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user, e.target.value)}
                        disabled={setRole.isPending}
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400 disabled:opacity-50"
                      >
                        {ALL_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {t.admin.roles[r as keyof typeof t.admin.roles] ?? r}
                          </option>
                        ))}
                      </select>
                      {saved === user.id && (
                        <span className="text-xs text-green-600">{t.admin.roleSaved}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${user.isVerified ? 'bg-green-400' : 'bg-gray-300'}`}
                    />
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {new Date(user.createdAt).toLocaleDateString('ro-RO')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
