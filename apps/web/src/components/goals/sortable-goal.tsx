import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { type CheckedState } from '@radix-ui/react-checkbox'
import React from 'react'
import { Goal } from './goal'

interface SortableGoalProps {
  goal: any
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onToggleStatus: (id: string, checked: CheckedState) => void
  isDeleting: boolean
  deleteVariables?: { id: string }
}

export const SortableGoal: React.FC<SortableGoalProps> = ({ goal, onEdit, onDelete, onToggleStatus, isDeleting, deleteVariables }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="rounded-lg border bg-card p-4 cursor-grab active:cursor-grabbing">
      <Goal goal={goal} onEdit={onEdit} onDelete={onDelete} onToggleStatus={onToggleStatus} isDeleting={isDeleting} deleteVariables={deleteVariables} />
    </div>
  )
}
