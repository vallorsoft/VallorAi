'use client'

import { useTranslation } from '@/lib/useTranslation'

export function ProjectsHeader() {
  const { t } = useTranslation()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">{t.projectsPage.title}</h1>
      <p className="text-gray-500 text-sm mt-1">{t.projectsPage.subtitle}</p>
    </div>
  )
}
