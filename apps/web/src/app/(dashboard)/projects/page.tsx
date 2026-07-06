import { Metadata } from 'next'
import { ProjectsGrid } from '@/components/projects/ProjectsGrid'

export const metadata: Metadata = { title: 'Proiecte' }

export default function ProjectsPage() {
  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Proiectele mele</h1>
            <p className="text-gray-500 text-sm mt-1">Gestionează și continuă proiectele tale de arhitectură</p>
          </div>
        </div>
        <ProjectsGrid />
      </div>
    </div>
  )
}
