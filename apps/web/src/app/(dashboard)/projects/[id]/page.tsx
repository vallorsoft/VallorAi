import { Metadata } from 'next'
import { ProjectDetail } from '@/components/projects/ProjectDetail'

export const metadata: Metadata = { title: 'Detalii proiect' }

export default function ProjectPage({ params }: { params: { id: string } }) {
  return <ProjectDetail projectId={params.id} />
}
