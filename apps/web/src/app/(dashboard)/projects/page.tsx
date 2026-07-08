import { Metadata } from 'next'
import { ProjectsGrid } from '@/components/projects/ProjectsGrid'
import { ProjectsHeader } from '@/components/projects/ProjectsHeader'

export const metadata: Metadata = { title: 'Proiecte' }

export default function ProjectsPage() {
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <ProjectsHeader />
        </div>
        <ProjectsGrid />
      </div>
    </div>
  )
}
