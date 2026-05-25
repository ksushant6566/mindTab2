import React from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { EditTask, EditTaskProps } from './edit-task'

type EditTaskDialogProps = EditTaskProps & { open: boolean; onOpenChange: (open: boolean) => void; }

export const EditTaskDialog: React.FC<EditTaskDialogProps> = ({ open, onOpenChange, ...props }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="sr-only">Edit Task</DialogTitle>
        <DialogDescription className="sr-only">Edit your task.</DialogDescription>
      </DialogHeader>
      <DialogContent className="max-w-lg md:max-w-xl border-none p-0">
        <EditTask {...props} />
      </DialogContent>
    </Dialog>
  )
}
