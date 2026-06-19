import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { EditTask, EditTaskProps } from './edit-task'

type EditTaskDialogProps = EditTaskProps & { open: boolean; onOpenChange: (open: boolean) => void; }

export const EditTaskDialog: React.FC<EditTaskDialogProps> = ({ open, onOpenChange, ...props }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden border border-border bg-[var(--bg-elev)] p-0 shadow-[0_20px_64px_-48px_rgba(0,0,0,0.95)] md:max-w-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Edit Task</DialogTitle>
          <DialogDescription>Edit your task.</DialogDescription>
        </DialogHeader>
        <EditTask {...props} />
      </DialogContent>
    </Dialog>
  )
}
