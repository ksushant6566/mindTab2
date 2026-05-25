import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CheckedState } from '@radix-ui/react-checkbox'
import React from 'react'
import { Task } from './task'

interface SortableTaskProps {
  task: any
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, checked: CheckedState) => void
  onUpdate?: (id: string, task: Record<string, unknown>) => void
  isDeleting: boolean
  deleteVariables?: string
  surface?: 'list' | 'kanban'
}

export const SortableTask: React.FC<SortableTaskProps> = ({
  task,
  onEdit,
  onDelete,
  onToggleStatus,
  onUpdate,
  isDeleting,
  deleteVariables,
  surface = 'list',
}) => {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.28 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      <Task
        task={task}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleStatus={onToggleStatus}
        onUpdate={onUpdate}
        isDeleting={isDeleting}
        deleteVariables={deleteVariables}
        surface={surface}
        isDragging={isDragging}
        dragHandleRef={setActivatorNodeRef}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  )
}
