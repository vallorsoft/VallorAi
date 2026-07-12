'use client'

import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'

export interface MarketplaceMaterial {
  id: string
  name: string
  category: string
  standardRef: string | null
  unit: string
  unitCostRON: number
  supplierId: string | null
  specSheet: Record<string, unknown>
}

export function useMarketplaceMaterials(opts: {
  category?: string
  supplierId?: string
  page?: number
}) {
  const params = new URLSearchParams()
  if (opts.category) params.set('category', opts.category)
  if (opts.supplierId) params.set('supplierId', opts.supplierId)
  if (opts.page) params.set('page', String(opts.page))

  return useQuery({
    queryKey: ['marketplace-materials', opts.category, opts.supplierId, opts.page],
    queryFn: () =>
      api.get(`/marketplace/materials?${params}`).then((r) => r.data.data as {
        materials: MarketplaceMaterial[]
        total: number
        page: number
        perPage: number
      }),
  })
}

export function useMarketplaceSuppliers() {
  return useQuery({
    queryKey: ['marketplace-suppliers'],
    queryFn: () => api.get('/marketplace/suppliers').then((r) => r.data.data as string[]),
  })
}
