import { Metadata } from 'next'
import { AdminUsers } from '@/components/admin/AdminUsers'

export const metadata: Metadata = { title: 'Utilizatori — Admin' }

export default function AdminUsersPage() {
  return <AdminUsers />
}
