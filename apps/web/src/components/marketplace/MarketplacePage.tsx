'use client'

import { useState } from 'react'
import { useMarketplaceMaterials, useMarketplaceSuppliers, type MarketplaceMaterial } from '@/hooks/useMarketplace'
import { useTranslation } from '@/lib/useTranslation'

const CATEGORIES = [
  'BLOCK', 'INSULATION', 'RENDER', 'FINISH', 'PAINT',
  'CONCRETE', 'REBAR', 'PRECAST', 'ROOFING', 'OTHER',
] as const

function MaterialCard({ mat }: { mat: MarketplaceMaterial }) {
  const { t } = useTranslation()
  const specSheet = mat.specSheet as Record<string, unknown>
  const priceUnverified = specSheet.priceVerified === false

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-gray-900 text-sm leading-tight">{mat.name}</p>
        {priceUnverified && (
          <span className="shrink-0 text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded px-1.5 py-0.5">
            {t.marketplace.priceUnverified}
          </span>
        )}
      </div>

      {mat.supplierId && (
        <p className="text-xs text-brand-600 font-medium">{mat.supplierId}</p>
      )}

      {mat.standardRef && (
        <p className="text-xs text-gray-400">{mat.standardRef}</p>
      )}

      <div className="mt-auto pt-2 border-t border-gray-50 flex items-center justify-between">
        <span className="text-xs text-gray-500">{t.marketplace.unitPrice}</span>
        <span className="text-sm font-bold text-gray-900">
          {mat.unitCostRON.toFixed(2)} RON / {mat.unit}
        </span>
      </div>
    </div>
  )
}

export function MarketplacePage() {
  const { t } = useTranslation()
  const [category, setCategory] = useState('')
  const [supplierId, setSupplierId] = useState('')

  const { data: suppliersData } = useMarketplaceSuppliers()
  const { data, isLoading } = useMarketplaceMaterials({ category, supplierId })

  const materials = data?.materials ?? []
  const suppliers = suppliersData ?? []

  return (
    <div className="p-4 sm:p-6 max-w-6xl">
      <h1 className="text-xl font-bold text-gray-900 mb-1">{t.marketplace.title}</h1>
      <p className="text-gray-500 text-sm mb-6">{t.marketplace.subtitle}</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">{t.marketplace.categoryLabel}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
          >
            <option value="">{t.marketplace.allCategories}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t.marketplace.categories[c as keyof typeof t.marketplace.categories] ?? c}
              </option>
            ))}
          </select>
        </div>

        {suppliers.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">{t.marketplace.supplierLabel}</label>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-brand-400"
            >
              <option value="">{t.marketplace.allSuppliers}</option>
              {suppliers.map((s) => (
                <option key={s} value={s ?? ''}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        )}

        {data && (
          <div className="flex items-end">
            <p className="text-xs text-gray-400">{data.total} produse</p>
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading && (
        <p className="text-sm text-gray-400">{t.marketplace.loading}</p>
      )}
      {!isLoading && materials.length === 0 && (
        <p className="text-sm text-gray-400">{t.marketplace.noResults}</p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {materials.map((mat) => (
          <MaterialCard key={mat.id} mat={mat} />
        ))}
      </div>
    </div>
  )
}
