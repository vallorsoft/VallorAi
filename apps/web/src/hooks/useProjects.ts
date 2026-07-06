import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await api.get('/projects')
      return res.data as Project[]
    },
  })
}

export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const res = await api.get(`/projects/${id}`)
      return res.data as Project
    },
    enabled: !!id,
  })
}

export function useCreateProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (data: { name: string; type: string; description?: string }) => {
      const res = await api.post('/projects', data)
      return res.data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  })
}

export function useHouse(projectId: string) {
  return useQuery({
    queryKey: ['houses', projectId],
    queryFn: async () => {
      const res = await api.get(`/houses/projects/${projectId}`)
      return res.data
    },
    enabled: !!projectId,
  })
}

export function useConversation(projectId: string) {
  return useQuery({
    queryKey: ['conversation', projectId],
    queryFn: async () => {
      const res = await api.get(`/ai/projects/${projectId}/conversation`)
      return res.data as ConversationMessage[]
    },
    enabled: !!projectId,
  })
}

interface Project {
  id: string
  name: string
  type: string
  status: string
  style?: string
  createdAt: string
  updatedAt: string
}

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt: string
}
