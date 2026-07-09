'use client'

import { Home } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'
import { useProjects, useCreateProject } from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'
import { DATE_LOCALES, type Dictionary } from '@/locales'

export function ProjectsGrid() {
  const { t, locale } = useTranslation()
  const { data: projects, isLoading } = useProjects()
  const createProject = useCreateProject()
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState('')

  const handleCreate = async () => {
    if (!name.trim()) return
    await createProject.mutateAsync({ name, type: 'FAMILY_HOUSE' })
    setName('')
    setShowModal(false)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 h-40 animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* New project card */}
        <button
          onClick={() => setShowModal(true)}
          className="bg-white rounded-xl border-2 border-dashed border-gray-200 h-40 flex flex-col items-center justify-center gap-2 hover:border-brand-300 hover:bg-brand-50 transition-colors group"
        >
          <div className="w-10 h-10 rounded-full bg-gray-100 group-hover:bg-brand-100 flex items-center justify-center text-xl transition-colors">
            +
          </div>
          <span className="text-sm font-medium text-gray-500 group-hover:text-brand-600">{t.projectsGrid.newProject}</span>
        </button>

        {projects?.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`}>
            <div className="bg-white rounded-xl border border-gray-100 p-5 h-40 flex flex-col hover:shadow-md transition-shadow cursor-pointer">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-brand-50 rounded-lg flex items-center justify-center"><Home className="w-5 h-5 text-brand-600" /></div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(p.status)}`}>
                  {statusLabel(p.status, t)}
                </span>
              </div>
              <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{p.name}</h3>
              <p className="text-xs text-gray-400 mt-auto">
                {new Date(p.updatedAt).toLocaleDateString(DATE_LOCALES[locale])}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h2 className="font-bold text-gray-900 mb-4">{t.projectsGrid.modalTitle}</h2>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.projectsGrid.namePlaceholder}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 mb-4"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
              >
                {t.projectsGrid.cancel}
              </button>
              <button
                onClick={handleCreate}
                disabled={!name.trim() || createProject.isPending}
                className="flex-1 px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
              >
                {createProject.isPending ? t.projectsGrid.creating : t.projectsGrid.create}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function statusLabel(s: string, t: Dictionary) {
  return (t.projectsGrid.status as Record<string, string>)[s] ?? s
}

function statusColor(s: string) {
  return ({
    DRAFT: 'bg-gray-100 text-gray-600',
    INTERVIEW: 'bg-blue-50 text-blue-600',
    DESIGNING: 'bg-brand-50 text-brand-600',
    REVIEW: 'bg-amber-50 text-amber-600',
    COMPLETE: 'bg-green-50 text-green-600',
  }[s] ?? 'bg-gray-100 text-gray-600')
}
