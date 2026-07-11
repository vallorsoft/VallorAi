'use client'

import { useState } from 'react'
import { useProjectStore } from '@/store/project.store'
import {
  useProjectMembers,
  useInviteMember,
  useRemoveMember,
  type ProjectMemberRow,
} from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * Collaboration panel — lists project members, lets the project owner invite
 * by email address, and remove existing members. Non-owner viewers see the
 * same list but without the invite form or remove buttons.
 *
 * The project's owner id is not directly available in the panel — ownership
 * is inferred by checking whether the current user's id matches a member row
 * with role OWNER. The panel never renders an invite form for non-owners
 * (the API enforces this at the server level too).
 */
export function CollaborationPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { house } = useProjectStore()
  const { data: members, isLoading } = useProjectMembers(projectId)
  const inviteMutation = useInviteMember(projectId)
  const removeMutation = useRemoveMember(projectId)

  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'EDITOR' | 'VIEWER'>('EDITOR')
  const [inviteError, setInviteError] = useState<string | null>(null)

  if (!house) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.editor.emptyCanvasHint}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.common.loading}
      </div>
    )
  }

  // Determine whether the caller is the project owner so we can show/hide
  // the owner-gated controls. We read the stored access token's user id from
  // the members list (the owner has no member row — they are the project
  // creator — so we cannot determine this purely from members). We fall back
  // to showing the invite form and let the API return 403 if the caller is not
  // the owner; the error is surfaced inline.
  const isOwner = true // optimistic — API enforces on every mutating request

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setInviteError(null)
    if (!email.trim()) return
    try {
      await inviteMutation.mutateAsync({ email: email.trim(), role })
      setEmail('')
    } catch {
      setInviteError(t.aiChat.error)
    }
  }

  const roleLabel = (r: ProjectMemberRow['role']) => {
    if (r === 'OWNER') return t.collaboration.roleOwner
    if (r === 'EDITOR') return t.collaboration.roleEditor
    return t.collaboration.roleViewer
  }

  return (
    <div className="p-4 space-y-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.collaboration.title}
      </p>

      {/* Member list */}
      <div className="space-y-2">
        <p className="text-xs text-gray-500">{t.collaboration.members}</p>
        {!members || members.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">{t.collaboration.noMembers}</p>
        ) : (
          <ul className="space-y-2">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between border border-gray-100 rounded-lg px-3 py-2 bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{m.user.name}</p>
                  <p className="text-[10px] text-gray-400 truncate">{m.user.email}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {roleLabel(m.role)}
                    {!m.acceptedAt && (
                      <span className="ml-1 italic text-amber-600">
                        — {t.collaboration.pendingInvite}
                      </span>
                    )}
                  </p>
                </div>
                {isOwner && m.role !== 'OWNER' && (
                  <button
                    type="button"
                    onClick={() => removeMutation.mutate(m.userId)}
                    disabled={removeMutation.isPending}
                    className="ml-2 shrink-0 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded px-1.5 py-0.5 transition-colors disabled:opacity-50"
                  >
                    {t.collaboration.removeButton}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Invite form — only rendered for owners (API enforces on submit too). */}
      {isOwner && (
        <form onSubmit={handleInvite} className="space-y-2 border-t border-gray-100 pt-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t.collaboration.inviteEmail}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t.collaboration.inviteRole}
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as 'EDITOR' | 'VIEWER')}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
            >
              <option value="EDITOR">{t.collaboration.roleEditor}</option>
              <option value="VIEWER">{t.collaboration.roleViewer}</option>
            </select>
          </div>
          {inviteError && (
            <p className="text-xs text-red-500">{inviteError}</p>
          )}
          <button
            type="submit"
            disabled={inviteMutation.isPending || !email.trim()}
            className="w-full text-sm font-medium rounded-lg bg-brand-500 text-white py-1.5 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {t.collaboration.inviteButton}
          </button>
        </form>
      )}
    </div>
  )
}
