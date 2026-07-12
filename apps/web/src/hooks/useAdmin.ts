'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '@/lib/api'

export function useAdminStats() {
  return useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then((r) => r.data.data as {
      userCount: number
      projectCount: number
      houseCount: number
      materialCount: number
    }),
  })
}

export interface AdminUser {
  id: string
  email: string
  name: string
  role: string
  isVerified: boolean
  createdAt: string
  language: string
}

export function useAdminUsers(page = 1) {
  return useQuery({
    queryKey: ['admin-users', page],
    queryFn: () =>
      api.get(`/admin/users?page=${page}&perPage=50`).then((r) => r.data.data as {
        users: AdminUser[]
        total: number
        page: number
        perPage: number
      }),
  })
}

export function useSetUserRole() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      api.patch(`/admin/users/${userId}/role`, { role }).then((r) => r.data.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })
}
