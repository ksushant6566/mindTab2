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
export const searchNotesQueryOptions = (query: string) => _searchNotesQueryOptions(api, query);

// Auth stays web-specific
export { useAuth } from "./use-auth";
export type { User } from "./use-auth";
export { conversationsQueryOptions, conversationMessagesQueryOptions } from "./use-chat";
export {
  aiProvidersQueryOptions,
  saveAIProviderCredential,
  deleteAIProviderCredential,
} from "./use-ai-providers";
export type {
  AIProviderConfiguration,
  AIProviderId,
  AIModelOption,
} from "./use-ai-providers";
export { savesInfiniteQueryOptions, savesQueryOptions, saveQueryOptions } from "./use-saves";
export type { SaveDetail, SaveListItem } from "./use-saves";
