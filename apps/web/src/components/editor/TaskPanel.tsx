'use client'

import { useState } from 'react'
import {
  useProjectTasks,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  type ProjectTaskRow,
} from '@/hooks/useProjects'
import { useTranslation } from '@/lib/useTranslation'

/**
 * Task management panel — lists project tasks, lets any editor/owner create
 * new tasks, mark them done/in-progress, and delete them.
 *
 * VIEWER members cannot create or mutate tasks (the API enforces 403); they
 * still see the full list in read-only mode.
 */
export function TaskPanel({ projectId }: { projectId: string }) {
  const { t } = useTranslation()
  const { data: tasks, isLoading } = useProjectTasks(projectId)
  const createMutation = useCreateTask(projectId)
  const updateMutation = useUpdateTask(projectId)
  const deleteMutation = useDeleteTask(projectId)

  const [showForm, setShowForm] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH'>('MEDIUM')

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-gray-400 text-center py-8">
        {t.tasks.loading}
      </div>
    )
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    await createMutation.mutateAsync({ title: newTitle.trim(), priority: newPriority })
    setNewTitle('')
    setNewPriority('MEDIUM')
    setShowForm(false)
  }

  return (
    <div className="p-4 space-y-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {t.tasks.title}
      </p>

      {!tasks || tasks.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">{t.tasks.empty}</p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onMarkDone={() =>
                updateMutation.mutate({ taskId: task.id, status: 'DONE' })
              }
              onMarkInProgress={() =>
                updateMutation.mutate({ taskId: task.id, status: 'IN_PROGRESS' })
              }
              onDelete={() => deleteMutation.mutate(task.id)}
            />
          ))}
        </div>
      )}

      {showForm ? (
        <form onSubmit={(e) => void handleCreate(e)} className="space-y-2 border border-gray-200 rounded-lg p-3 bg-gray-50">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={t.tasks.titleLabel}
            className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
            autoFocus
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value as 'LOW' | 'MEDIUM' | 'HIGH')}
            className="w-full text-sm border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-brand-500"
          >
            <option value="LOW">{t.tasks.priorityLow}</option>
            <option value="MEDIUM">{t.tasks.priorityMedium}</option>
            <option value="HIGH">{t.tasks.priorityHigh}</option>
          </select>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createMutation.isPending || !newTitle.trim()}
              className="flex-1 text-sm bg-brand-500 text-white rounded-md py-1.5 hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              {t.tasks.addButton}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="text-sm text-gray-500 hover:text-gray-700 px-3"
            >
              {/* cancel icon — no text needed, accessible via title */}
              &times;
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full text-sm rounded-lg border border-dashed border-gray-300 py-2 text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
        >
          {t.tasks.addButton}
        </button>
      )}
    </div>
  )
}

function TaskCard({
  task,
  onMarkDone,
  onMarkInProgress,
  onDelete,
}: {
  task: ProjectTaskRow
  onMarkDone: () => void
  onMarkInProgress: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()

  const isDone = task.status === 'DONE'
  const isOverdue =
    task.dueDate != null &&
    !isDone &&
    new Date(task.dueDate) < new Date()

  const priorityColor: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700',
    MEDIUM: 'bg-amber-100 text-amber-700',
    LOW: 'bg-gray-100 text-gray-600',
  }

  const priorityLabel: Record<string, string> = {
    HIGH: t.tasks.priorityHigh,
    MEDIUM: t.tasks.priorityMedium,
    LOW: t.tasks.priorityLow,
  }

  return (
    <div
      className={`border rounded-lg p-3 space-y-1.5 ${
        isDone ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`text-sm font-medium leading-snug ${
            isDone ? 'text-gray-400 line-through' : 'text-gray-800'
          }`}
        >
          {task.title}
        </span>
        <button
          type="button"
          onClick={onDelete}
          title={t.tasks.deleteButton}
          className="shrink-0 text-gray-300 hover:text-red-400 transition-colors text-sm"
        >
          &times;
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`text-xs px-1.5 py-0.5 rounded font-medium ${
            priorityColor[task.priority] ?? 'bg-gray-100 text-gray-600'
          }`}
        >
          {priorityLabel[task.priority] ?? task.priority}
        </span>

        {isOverdue && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">
            {t.tasks.overdue}
          </span>
        )}

        {task.assignedTo ? (
          <span className="text-xs text-gray-500">{task.assignedTo.name}</span>
        ) : (
          <span className="text-xs text-gray-400">{t.tasks.noAssignee}</span>
        )}
      </div>

      {task.dueDate && (
        <p className="text-xs text-gray-400">
          {t.tasks.dueDateLabel}:{' '}
          {new Date(task.dueDate).toLocaleDateString()}
        </p>
      )}

      <div className="flex gap-2 pt-0.5">
        {!isDone && (
          <button
            type="button"
            onClick={onMarkDone}
            className="text-xs text-green-600 hover:text-green-800 underline underline-offset-2 transition-colors"
          >
            {t.tasks.markDone}
          </button>
        )}
        {task.status !== 'IN_PROGRESS' && !isDone && (
          <button
            type="button"
            onClick={onMarkInProgress}
            className="text-xs text-indigo-600 hover:text-indigo-800 underline underline-offset-2 transition-colors"
          >
            {t.tasks.markInProgress}
          </button>
        )}
      </div>
    </div>
  )
}
