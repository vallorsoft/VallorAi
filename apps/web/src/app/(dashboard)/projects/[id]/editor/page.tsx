import { Metadata } from 'next'
import { EditorLayout } from '@/components/editor/EditorLayout'

export const metadata: Metadata = { title: 'Editor plan' }

export default function EditorPage({ params }: { params: { id: string } }) {
  return <EditorLayout projectId={params.id} />
}
