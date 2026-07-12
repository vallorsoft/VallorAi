import { Metadata } from 'next'
import { AdminDashboard } from '@/components/admin/AdminDashboard'

export const metadata: Metadata = { title: 'Admin — AI Home Designer' }

export default function AdminPage() {
  return <AdminDashboard />
}
