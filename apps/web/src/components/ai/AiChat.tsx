'use client'

import { useState, useRef, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/useTranslation'
import { appliedRoomFromMetadata, parseAssistantMessage } from '@/lib/parseAssistantMessage'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  metadata?: unknown
  createdAt: string
}

interface AiChatProps {
  projectId: string
}

export function AiChat({ projectId }: AiChatProps) {
  const { t } = useTranslation()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [rebuilding, setRebuilding] = useState(false)
  const [rebuildStatus, setRebuildStatus] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ['conversation', projectId],
    queryFn: async () => {
      const res = await api.get(`/ai/projects/${projectId}/conversation`)
      return res.data
    },
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamingContent])

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setSending(true)
    setStreamingContent('')

    try {
      // Use non-streaming chat for simplicity; swap to SSE stream for production
      await api.post(`/ai/projects/${projectId}/chat`, { message: text })
      await qc.invalidateQueries({ queryKey: ['conversation', projectId] })
    } catch (err) {
      const code = axios.isAxiosError(err) ? err.response?.data?.error?.code : undefined
      setStreamingContent(code === 'SERVICE_UNAVAILABLE' ? t.aiChat.quotaExceeded : t.aiChat.error)
    } finally {
      setSending(false)
    }
  }

  const rebuildFromConversation = async () => {
    if (rebuilding) return
    setRebuilding(true)
    setRebuildStatus(null)
    try {
      const res = await api.post(`/ai/projects/${projectId}/rebuild`)
      const appliedCount = res.data?.appliedCount ?? 0
      setRebuildStatus(`${t.aiChat.rebuildDone}: ${appliedCount}`)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['conversation', projectId] }),
        qc.invalidateQueries({ queryKey: ['houses', projectId] }),
      ])
    } catch {
      setRebuildStatus(t.aiChat.rebuildError)
    } finally {
      setRebuilding(false)
    }
  }

  const hasAssistantReply = messages.some((m) => m.role === 'assistant')

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && !sending && (
          <div className="text-center text-gray-400 text-sm py-8">
            <div className="text-3xl mb-2">👋</div>
            <p>{t.aiChat.greeting1}</p>
            <p className="mt-1">{t.aiChat.greeting2}</p>
          </div>
        )}

        {messages.map((msg) => {
          const appliedRoom = msg.role === 'assistant' ? appliedRoomFromMetadata(msg.metadata) : null
          return (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-brand-500 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}
              >
                {msg.role === 'assistant' ? parseAssistantMessage(msg.content) : msg.content}
                {appliedRoom && (
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200 text-xs text-gray-500">
                    {appliedRoom.action === 'created' ? t.aiChat.roomAdded : t.aiChat.roomUpdated}:{' '}
                    {appliedRoom.name} ({appliedRoom.area} m²)
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {sending && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3 py-2 rounded-2xl rounded-bl-sm">
              <span className="flex gap-1 items-center text-gray-400 text-sm">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}

        {streamingContent && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-800 px-3 py-2 rounded-2xl rounded-bl-sm max-w-[80%] text-sm leading-relaxed">
              {streamingContent}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3">
        {hasAssistantReply && (
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              onClick={rebuildFromConversation}
              disabled={rebuilding}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {rebuilding ? t.aiChat.rebuilding : t.aiChat.rebuildButton}
            </button>
            {rebuildStatus && <span className="text-xs text-gray-400">{rebuildStatus}</span>}
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder={t.aiChat.placeholder}
            rows={1}
            className="flex-1 resize-none px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-32"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="p-2 bg-brand-500 text-white rounded-xl hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
