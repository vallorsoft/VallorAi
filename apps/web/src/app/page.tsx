'use client'

import Link from 'next/link'
import { MessagesSquare, Ruler, Scale } from 'lucide-react'
import { useTranslation } from '@/lib/useTranslation'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'

// One icon per landing feature, in dictionary order (AI plan generation,
// 2D/3D editor, Romanian building rules) — presentation only, so it lives
// here rather than in the i18n dictionary.
const FEATURE_ICONS = [MessagesSquare, Ruler, Scale]

/**
 * A miniature floor plan drawn with plain borders — the product's own
 * subject matter as the hero visual, instead of a stock illustration.
 */
function PlanSketch({ rooms }: { rooms: { living: string; bedroom: string; kitchen: string; bath: string } }) {
  return (
    <div
      aria-hidden="true"
      className="relative w-full max-w-md aspect-[5/4] border-2 border-gray-900 bg-white"
    >
      {/* Interior partitions */}
      <div className="absolute left-[42%] top-0 bottom-[38%] w-0.5 bg-gray-900" />
      <div className="absolute left-0 right-[30%] top-[62%] h-0.5 bg-gray-900" />
      <div className="absolute left-[70%] top-[38%] bottom-0 w-0.5 bg-gray-900" />
      {/* Door swings */}
      <div className="absolute left-[42%] top-[30%] w-8 h-8 -translate-x-full border-b border-l border-gray-400 rounded-bl-full" />
      <div className="absolute left-[52%] top-[62%] w-8 h-8 -translate-y-full border-t border-r border-gray-400 rounded-tr-full" />
      {/* Window marks on the exterior wall */}
      <div className="absolute top-0 left-[12%] w-16 h-1 -translate-y-[3px] border-y-2 border-gray-900 bg-white" />
      <div className="absolute bottom-0 right-[8%] w-16 h-1 translate-y-[3px] border-y-2 border-gray-900 bg-white" />
      {/* Room labels */}
      <span className="absolute left-[6%] top-[8%] text-[10px] uppercase tracking-wider text-gray-500">
        {rooms.living} · 24 m²
      </span>
      <span className="absolute left-[48%] top-[8%] text-[10px] uppercase tracking-wider text-gray-500">
        {rooms.bedroom} · 14 m²
      </span>
      <span className="absolute left-[6%] bottom-[12%] text-[10px] uppercase tracking-wider text-gray-500">
        {rooms.kitchen} · 11 m²
      </span>
      <span className="absolute right-[6%] bottom-[12%] text-[10px] uppercase tracking-wider text-gray-500">
        {rooms.bath} · 6 m²
      </span>
      {/* Dimension line */}
      <div className="absolute -bottom-6 left-0 right-0 flex items-center gap-2 text-[10px] text-gray-400">
        <span className="flex-1 border-t border-gray-300" />
        10,40 m
        <span className="flex-1 border-t border-gray-300" />
      </div>
    </div>
  )
}

export default function HomePage() {
  const { t } = useTranslation()

  return (
    <main className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between max-w-6xl mx-auto w-full border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">AI</span>
          </div>
          <span className="font-semibold text-gray-900 text-lg">{t.common.appName}</span>
        </div>
        <nav className="flex items-center gap-4">
          <LanguageSwitcher />
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            {t.landing.headerLogin}
          </Link>
          <Link
            href="/register"
            className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
          >
            {t.landing.headerCta}
          </Link>
        </nav>
      </header>

      {/* Hero: text left, the product's own floor-plan language right */}
      <section className="flex-1 max-w-6xl mx-auto w-full px-6 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
        <div>
          <h1 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6 leading-tight">
            {t.landing.heroTitle}{' '}
            <span className="text-brand-600">{t.landing.heroHighlight}</span>
          </h1>
          <p className="text-lg text-gray-600 mb-10 leading-relaxed max-w-xl">
            {t.landing.heroSubtitle}
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Link
              href="/register"
              className="bg-brand-500 text-white px-7 py-3 rounded-lg text-base font-medium hover:bg-brand-600 transition-colors"
            >
              {t.landing.ctaPrimary}
            </Link>
            <Link
              href="/login"
              className="border border-gray-300 text-gray-700 px-7 py-3 rounded-lg text-base font-medium hover:bg-gray-50 transition-colors"
            >
              {t.landing.ctaSecondary}
            </Link>
          </div>
        </div>
        <div className="hidden lg:flex justify-center pb-6">
          <PlanSketch rooms={t.landing.sketchRooms} />
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-gray-100 bg-gray-50/60">
        <div className="max-w-6xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-3 gap-10 w-full">
          {t.landing.features.map((f, i) => {
            const Icon = FEATURE_ICONS[i] ?? Ruler
            return (
              <div key={f.title} className="border-t-2 border-gray-900 pt-5">
                <Icon className="w-5 h-5 text-brand-600 mb-3" />
                <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            )
          })}
        </div>
      </section>

      <footer className="text-center py-6 text-xs text-gray-400 border-t border-gray-100">
        © {new Date().getFullYear()} {t.common.appName} · {t.landing.footerTagline}
      </footer>
    </main>
  )
}
