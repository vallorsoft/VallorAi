'use client'

import { useMemo } from 'react'
import { useProjectStore } from '@/store/project.store'
import { useCostEstimate, type CostBoqLine } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'
import { DATE_LOCALES } from '@/locales/types'
import { useLocaleStore } from '@/store/locale.store'

/**
 * Bill-of-quantities inspector — shows three ordered sections:
 *
 *   1. Materials: real BOQ lines grouped by category (foundation / walls /
 *      tie-columns / centuri / lintels / roof / other flat-rate MEP), each
 *      with an amber "Neconfirmat" chip when the price or quantity is an
 *      unverified estimate.
 *   2. Labor: market-rate manoperă lines (Bursa Construcțiilor 2024, all
 *      priceVerified: false) — zidărie, tencuială, structură, etc.
 *   3. Tax: TVA 19% (Legea 227/2015) applied to materials + labor subtotal,
 *      with a note that the 5% reduced rate may apply.
 *
 * Footer shows materials subtotal / labor subtotal / VAT / grand total.
 *
 * Category mapping: `wall-*` → wall, `foundation-*` → foundation,
 * `tie-column-*` → tieColumn, `centura-*` → centura, `lintel` → lintel,
 * `roof-*` → roof, `labor` → labor section (separate), `tax` → tax section
 * (separate), everything else → other.
 */
export function CostBoqPanel() {
  const { t } = useTranslation()
  const { activeProjectId } = useProjectStore()
  const { locale } = useLocaleStore()
  const { data, isLoading } = useCostEstimate(activeProjectId)

  const materialLines = useMemo(
    () => (data?.breakdown ?? []).filter((l) => l.category !== 'labor' && l.category !== 'tax'),
    [data?.breakdown],
  )
  const laborLines = useMemo(
    () => (data?.breakdown ?? []).filter((l) => l.category === 'labor'),
    [data?.breakdown],
  )
  const taxLine = useMemo(
    () => data?.breakdown.find((l) => l.category === 'tax'),
    [data?.breakdown],
  )
  const materialGrouped = useMemo(() => groupByCategory(materialLines), [materialLines])

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

  const format = (n: number) =>
    n.toLocaleString(DATE_LOCALES[locale], { maximumFractionDigits: 2 })

  const subtotalMaterials = data.subtotalMaterials ?? 0
  const subtotalLabor = data.subtotalLabor ?? 0
  const vatAmount = data.vatAmount ?? 0
  const grandTotal = data.grandTotal ?? data.total ?? 0

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.editor.costBoqPanel.title}
      </p>

      {/* ── Materials sections ──────────────────────────────────────────── */}
      {materialGrouped.map(({ key, lines }) => (
        <section key={key} className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            {t.editor.costBoqPanel.categories[key]}
          </p>
          <div className="space-y-2">
            {lines.map((line, i) => (
              <BoqLineCard
                key={`${line.category}-${line.name}-${i}`}
                line={line}
                currency={data.currency}
                format={format}
                unverifiedLabel={t.editor.costBoqPanel.unverifiedChip}
                standardLabel={t.editor.costBoqPanel.standardColumn}
                quantityLabel={t.editor.costBoqPanel.quantityColumn}
                unitPriceLabel={t.editor.costBoqPanel.unitPriceColumn}
                lineTotalLabel={t.editor.costBoqPanel.lineTotalColumn}
              />
            ))}
          </div>
        </section>
      ))}

      {/* Materials subtotal row */}
      {materialGrouped.length > 0 && (
        <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-100 pt-2">
          <span>{t.editor.costBoqPanel.subtotalMaterials}</span>
          <span className="font-medium text-gray-900">
            {format(subtotalMaterials)} {data.currency}
          </span>
        </div>
      )}

      {/* ── Labor section ───────────────────────────────────────────────── */}
      {laborLines.length > 0 && (
        <>
          <section className="space-y-2">
            <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
              {t.editor.costBoqPanel.laborSection}
            </p>
            <div className="space-y-2">
              {laborLines.map((line, i) => (
                <BoqLineCard
                  key={`labor-${line.name}-${i}`}
                  line={line}
                  currency={data.currency}
                  format={format}
                  unverifiedLabel={t.editor.costBoqPanel.unverifiedChip}
                  standardLabel={t.editor.costBoqPanel.standardColumn}
                  quantityLabel={t.editor.costBoqPanel.quantityColumn}
                  unitPriceLabel={t.editor.costBoqPanel.unitPriceColumn}
                  lineTotalLabel={t.editor.costBoqPanel.lineTotalColumn}
                />
              ))}
            </div>
          </section>

          <div className="flex items-center justify-between text-xs text-gray-600 border-t border-gray-100 pt-2">
            <span>{t.editor.costBoqPanel.subtotalLabor}</span>
            <span className="font-medium text-gray-900">
              {format(subtotalLabor)} {data.currency}
            </span>
          </div>
        </>
      )}

      {/* ── Tax section ─────────────────────────────────────────────────── */}
      {taxLine && (
        <section className="space-y-2">
          <p className="text-[11px] font-semibold text-gray-600 uppercase tracking-wide">
            {t.editor.costBoqPanel.taxSection}
          </p>
          <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm font-medium text-gray-900">
                {t.editor.costBoqPanel.vatRate}
              </p>
              <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
                {t.editor.costBoqPanel.unverifiedChip}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
              <dt className="font-medium">{t.editor.costBoqPanel.lineTotalColumn}</dt>
              <dd className="text-right font-medium text-gray-900">
                {format(vatAmount)} {data.currency}
              </dd>
            </dl>
          </div>
          <p className="text-[11px] text-amber-700">{t.editor.costBoqPanel.vatNote}</p>
        </section>
      )}

      {/* ── Summary footer ──────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 pt-3 space-y-1.5">
        {materialGrouped.length > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t.editor.costBoqPanel.subtotalMaterials}</span>
            <span>{format(subtotalMaterials)} {data.currency}</span>
          </div>
        )}
        {laborLines.length > 0 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t.editor.costBoqPanel.subtotalLabor}</span>
            <span>{format(subtotalLabor)} {data.currency}</span>
          </div>
        )}
        {taxLine && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{t.editor.costBoqPanel.vatRate}</span>
            <span>{format(vatAmount)} {data.currency}</span>
          </div>
        )}
        <div className="flex items-center justify-between pt-1.5 border-t border-gray-100">
          <span className="text-sm font-semibold text-gray-700">
            {t.editor.costBoqPanel.grandTotal}
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {format(grandTotal)} {data.currency}
          </span>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared line-card component (materials and labor share the same visual style)
// ---------------------------------------------------------------------------

interface BoqLineCardProps {
  line: CostBoqLine
  currency: string
  format: (n: number) => string
  unverifiedLabel: string
  standardLabel: string
  quantityLabel: string
  unitPriceLabel: string
  lineTotalLabel: string
}

function BoqLineCard({
  line,
  currency,
  format,
  unverifiedLabel,
  standardLabel,
  quantityLabel,
  unitPriceLabel,
  lineTotalLabel,
}: BoqLineCardProps) {
  const lineTotal = line.quantity * line.unitPrice
  const unverified = line.verified === false || line.priceVerified === false

  return (
    <div className="border border-gray-100 rounded-lg p-3 bg-gray-50">
      <div className="flex items-start justify-between gap-2 mb-1">
        <p className="text-sm font-medium text-gray-900 leading-snug">{line.name}</p>
        {unverified && (
          <span className="shrink-0 text-[10px] uppercase tracking-wide font-medium px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">
            {unverifiedLabel}
          </span>
        )}
      </div>
      {line.standardRef && (
        <p className="text-xs text-gray-500 mb-1">
          {standardLabel}: {line.standardRef}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-600">
        <dt>{quantityLabel}</dt>
        <dd className="text-right text-gray-900">
          {format(line.quantity)} {line.unit}
        </dd>
        <dt>{unitPriceLabel}</dt>
        <dd className="text-right text-gray-900">
          {format(line.unitPrice)} {currency}
        </dd>
        <dt className="font-medium">{lineTotalLabel}</dt>
        <dd className="text-right font-medium text-gray-900">
          {format(lineTotal)} {currency}
        </dd>
      </dl>
      {line.notes && (
        <p className="mt-1.5 text-[11px] text-amber-700">{line.notes}</p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category grouping (materials only — labor and tax are handled separately)
// ---------------------------------------------------------------------------

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
