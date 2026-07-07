'use client'

import Link from 'next/link'
import { useProject } from '@/hooks/useProjects'
import { AiChat } from '@/components/ai/AiChat'
import { useTranslation } from '@/lib/useTranslation'
import { DATE_LOCALES } from '@/locales'

export function ProjectDetail({ projectId }: { projectId: string }) {
  const { t, locale } = useTranslation()
  const { data: project, isLoading } = useProject(projectId)

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="h-8 bg-gray-100 rounded animate-pulse mb-4 w-48" />
        <div className="h-4 bg-gray-100 rounded animate-pulse w-72" />
      </div>
    )
  }

  if (!project) return <div className="p-6 text-gray-500">{t.projectDetail.notFound}</div>

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {project.type} · {new Date(project.createdAt).toLocaleDateString(DATE_LOCALES[locale])}
          </p>
        </div>
        <Link
          href={`/projects/${projectId}/editor`}
          className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 transition-colors"
        >
          {t.projectDetail.openEditor}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI Chat panel */}
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden" style={{ height: '60vh' }}>
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-medium text-sm text-gray-700">{t.projectDetail.aiAssistantTitle}</h2>
          </div>
          <AiChat projectId={projectId} />
        </div>

        {/* Project info */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-medium text-sm text-gray-700 mb-3">{t.projectDetail.detailsTitle}</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">{t.projectDetail.typeLabel}</dt>
                <dd className="font-medium text-gray-900">{project.type}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">{t.projectDetail.statusLabel}</dt>
                <dd className="font-medium text-gray-900">{project.status}</dd>
              </div>
              {project.style && (
                <div className="flex justify-between">
                  <dt className="text-gray-500">{t.projectDetail.styleLabel}</dt>
                  <dd className="font-medium text-gray-900">{project.style}</dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h3 className="font-medium text-sm text-gray-700 mb-3">{t.projectDetail.quickActionsTitle}</h3>
            <div className="space-y-2">
              {[
                { label: t.projectDetail.actionValidateRules, icon: '⚖️', href: '#' },
                { label: t.projectDetail.actionEstimateCost, icon: '💰', href: '#' },
                { label: t.projectDetail.actionExportDxf, icon: '📐', href: '#' },
              ].map((a) => (
                <a
                  key={a.label}
                  href={a.href}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm text-gray-700 transition-colors"
                >
                  <span>{a.icon}</span>
                  {a.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
