import { api } from "../client";
import {
  tasksQueryOptions as _tasksQueryOptions,
  taskQueryOptions as _taskQueryOptions,
  tasksCountQueryOptions as _tasksCountQueryOptions,
  unassignedTasksQueryOptions as _unassignedTasksQueryOptions,
  useCreateTask as _useCreateTask,
  useUpdateTask as _useUpdateTask,
  useDeleteTask as _useDeleteTask,
  useUpdateTaskPositions as _useUpdateTaskPositions,
  useArchiveCompletedTasks as _useArchiveCompletedTasks,
  habitsQueryOptions as _habitsQueryOptions,
  habitQueryOptions as _habitQueryOptions,
  habitTrackerQueryOptions as _habitTrackerQueryOptions,
  useCreateHabit as _useCreateHabit,
  useUpdateHabit as _useUpdateHabit,
  useDeleteHabit as _useDeleteHabit,
  useTrackHabit as _useTrackHabit,
  useUntrackHabit as _useUntrackHabit,
  notesQueryOptions as _notesQueryOptions,
  noteQueryOptions as _noteQueryOptions,
  notesCountQueryOptions as _notesCountQueryOptions,
  useCreateNote as _useCreateNote,
  useUpdateNote as _useUpdateNote,
  useDeleteNote as _useDeleteNote,
  projectsQueryOptions as _projectsQueryOptions,
  projectQueryOptions as _projectQueryOptions,
  projectsStatsQueryOptions as _projectsStatsQueryOptions,
  useCreateProject as _useCreateProject,
  useUpdateProject as _useUpdateProject,
  useDeleteProject as _useDeleteProject,
  useArchiveProject as _useArchiveProject,
  activityQueryOptions as _activityQueryOptions,
  searchTasksQueryOptions as _searchTasksQueryOptions,
  searchHabitsQueryOptions as _searchHabitsQueryOptions,
  searchNotesQueryOptions as _searchNotesQueryOptions,
} from "@mindtab/core";

// Tasks - bind api client
export const tasksQueryOptions = (params?: Parameters<typeof _tasksQueryOptions>[1]) => _tasksQueryOptions(api, params);
export const taskQueryOptions = (id: string) => _taskQueryOptions(api, id);
export const tasksCountQueryOptions = (params?: Parameters<typeof _tasksCountQueryOptions>[1]) => _tasksCountQueryOptions(api, params);
export const unassignedTasksQueryOptions = () => _unassignedTasksQueryOptions(api);
export const useCreateTask = () => _useCreateTask(api);
export const useUpdateTask = () => _useUpdateTask(api);
export const useDeleteTask = () => _useDeleteTask(api);
export const useUpdateTaskPositions = () => _useUpdateTaskPositions(api);
export const useArchiveCompletedTasks = () => _useArchiveCompletedTasks(api);

// Habits - bind api client
export const habitsQueryOptions = () => _habitsQueryOptions(api);
export const habitQueryOptions = (id: string) => _habitQueryOptions(api, id);
export const habitTrackerQueryOptions = () => _habitTrackerQueryOptions(api);
export const useCreateHabit = () => _useCreateHabit(api);
export const useUpdateHabit = () => _useUpdateHabit(api);
export const useDeleteHabit = () => _useDeleteHabit(api);
export const useTrackHabit = () => _useTrackHabit(api);
export const useUntrackHabit = () => _useUntrackHabit(api);

// Notes - bind api client
export const notesQueryOptions = (params?: Parameters<typeof _notesQueryOptions>[1]) => _notesQueryOptions(api, params);
export const noteQueryOptions = (id: string) => _noteQueryOptions(api, id);
export const notesCountQueryOptions = () => _notesCountQueryOptions(api);
export const useCreateNote = () => _useCreateNote(api);
export const useUpdateNote = () => _useUpdateNote(api);
export const useDeleteNote = () => _useDeleteNote(api);

// Projects - bind api client
export const projectsQueryOptions = (params?: Parameters<typeof _projectsQueryOptions>[1]) => _projectsQueryOptions(api, params);
export const projectQueryOptions = (id: string) => _projectQueryOptions(api, id);
export const projectsStatsQueryOptions = () => _projectsStatsQueryOptions(api);
export const useCreateProject = () => _useCreateProject(api);
export const useUpdateProject = () => _useUpdateProject(api);
export const useDeleteProject = () => _useDeleteProject(api);
export const useArchiveProject = () => _useArchiveProject(api);

// Activity - bind api client
export const activityQueryOptions = (userId: string) => _activityQueryOptions(api, userId);

// Search - bind api client
export const searchTasksQueryOptions = (query: string) => _searchTasksQueryOptions(api, query);
export const searchHabitsQueryOptions = (query: string) => _searchHabitsQueryOptions(api, query);
export const searchNotesQueryOptions = (query: string) => _searchNotesQueryOptions(api, query);

// Auth stays web-specific
export { useAuth } from "./use-auth";
