import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

interface AiSettings {
  allowPaidAiProviders: boolean
}

export function useAiSettings() {
  return useQuery({
    queryKey: ['settings', 'ai'],
    queryFn: async () => {
      const res = await api.get('/settings/ai')
      return res.data as AiSettings
    },
  })
}

export function useUpdateAiSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (allowPaidAiProviders: boolean) => {
      const res = await api.patch('/settings/ai', { allowPaidAiProviders })
      return res.data as AiSettings
    },
    onSuccess: (data) => qc.setQueryData(['settings', 'ai'], data),
  })
}
