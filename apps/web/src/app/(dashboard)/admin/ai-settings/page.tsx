import { Metadata } from 'next'
import { AdminAiSettings } from '@/components/admin/AdminAiSettings'

export const metadata: Metadata = { title: 'Setări AI' }

export default function AdminAiSettingsPage() {
  return <AdminAiSettings />
}
