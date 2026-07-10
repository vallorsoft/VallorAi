'use client'

import { useMemo } from 'react'
import { useProjectStore } from '@/store/project.store'
import { useCostEstimate, type CostBoqLine } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'
import { DATE_LOCALES } from '@/locales/types'
import { useLocaleStore } from '@/store/locale.store'

/**
 * Bill-of-quantities inspector — groups every real BOQ line the cost engine
 * returns by category (walls / foundation / tie-columns / centuri / lintels
 * / roof / other) and shows material, standard, quantity + unit, unit price
 * and line total. Mirrors the read-only visual style of the other structural
 * panels (FoundationPanel etc.), with an amber "unverified" chip on any line
 * the engine flagged (`verified: false` or `priceVerified: false`) — same
 * pattern as WallLayerPanel's unverified-price notice.
 *
 * Category mapping matches CostsService's line categories: `wall-*` →
 * wall bucket, `foundation-*` → foundation, `tie-column-*` → tieColumn,
 * `centura-*` → centura, `lintel` → lintel, `roof-*` → roof, everything
 * else (the flat MEP/finishes area-rates that still don't have a real BOQ
 * source) drops into "other".
 */
export function CostBoqPanel() {
  const { t } = useTranslation()
  const { activeProjectId } = useProjectStore()
  const { locale } = useLocaleStore()
  const { data, isLoading } = useCostEstimate(activeProjectId)

  const grouped = useMemo(() => groupByCategory(data?.breakdown ?? []), [data?.breakdown])

  if (!activeProjectId) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading || !data) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.costBoqPanel.loading}
      </div>
    )
  }

  if (data.breakdown.length === 0) {
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
          {t.editor.costBoqPanel.title}
        </p>
        <p className="text-sm text-gray-500">{t.editor.costBoqPanel.empty}</p>
      </div>
    )
  }

  const format = (n: number) => n.toLocaleString(DATE_LOCALES[locale], { maximumFractionDigits: 2 })

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.costBoqPanel.title}
      </p>

      {grouped.map(({ key, lines }) => (
        <section key={key} className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            {t.editor.costBoqPanel.categories[key]}
          </p>
          <div className="space-y-2">
            {lines.map((line, i) => {
              const lineTotal = line.quantity * line.unitPrice
              const unverified = line.verified === false || line.priceVerified === false
              return (
                <div
                  key={`${line.category}-${line.name}-${i}`}
                  className="border border-gray-100 rounded-lg p-3 bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900 leading-snug">{line.name}</p>
                    {unverified && (
                      <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                        {t.editor.costBoqPanel.unverifiedChip}
                      </span>
                    )}
                  </div>
                  {line.standardRef && (
                    <p className="text-xs text-gray-500 mb-1">
                      {t.editor.costBoqPanel.standardColumn}: {line.standardRef}
                    </p>
                  )}
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
                    <dt>{t.editor.costBoqPanel.quantityColumn}</dt>
                    <dd className="text-right text-gray-900">
                      {format(line.quantity)} {line.unit}
                    </dd>
                    <dt>{t.editor.costBoqPanel.unitPriceColumn}</dt>
                    <dd className="text-right text-gray-900">
                      {format(line.unitPrice)} {data.currency}
                    </dd>
                    <dt className="font-medium">{t.editor.costBoqPanel.lineTotalColumn}</dt>
                    <dd className="text-right font-medium text-gray-900">
                      {format(lineTotal)} {data.currency}
                    </dd>
                  </dl>
                  {line.notes && (
                    <p className="mt-1.5 text-[11px] text-amber-700">{line.notes}</p>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <div className="border-t border-gray-200 pt-3 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">
          {t.editor.costBoqPanel.grandTotal}
        </span>
        <span className="text-sm font-semibold text-gray-900">
          {format(data.total)} {data.currency}
        </span>
      </div>
    </div>
  )
}

type CategoryKey = keyof ReturnType<typeof categoryLabelsSource>

// Dummy accessor purely so `keyof` above matches the Dictionary's shape —
// hoists the union `wall | foundation | tieColumn | centura | lintel | roof | other`.
function categoryLabelsSource() {
  return {
    wall: '',
    foundation: '',
    tieColumn: '',
    centura: '',
    lintel: '',
    roof: '',
    other: '',
  }
}

function categoryOf(line: CostBoqLine): CategoryKey {
  const c = line.category
  if (c.startsWith('wall-')) return 'wall'
  if (c.startsWith('foundation-')) return 'foundation'
  if (c.startsWith('tie-column-')) return 'tieColumn'
  if (c.startsWith('centura-')) return 'centura'
  if (c === 'lintel') return 'lintel'
  if (c.startsWith('roof-') || c === 'roof') return 'roof'
  return 'other'
}

const CATEGORY_ORDER: CategoryKey[] = [
  'foundation',
  'wall',
  'tieColumn',
  'centura',
  'lintel',
  'roof',
  'other',
]

function groupByCategory(lines: CostBoqLine[]): { key: CategoryKey; lines: CostBoqLine[] }[] {
  const buckets = new Map<CategoryKey, CostBoqLine[]>()
  for (const line of lines) {
    const key = categoryOf(line)
    const bucket = buckets.get(key) ?? []
    bucket.push(line)
    buckets.set(key, bucket)
  }
  return CATEGORY_ORDER.flatMap((key) => {
    const bucket = buckets.get(key)
    return bucket && bucket.length > 0 ? [{ key, lines: bucket }] : []
  })
}
