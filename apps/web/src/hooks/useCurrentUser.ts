import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface CurrentUser {
  id: string
  email: string
  name: string
  role: string
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['users', 'me'],
    queryFn: async () => {
      const res = await api.get('/users/me')
      return res.data as CurrentUser
    },
  })
}
