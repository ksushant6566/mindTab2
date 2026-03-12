import { api } from "../client";
import {
  goalsQueryOptions as _goalsQueryOptions,
  goalQueryOptions as _goalQueryOptions,
  goalsCountQueryOptions as _goalsCountQueryOptions,
  unassignedGoalsQueryOptions as _unassignedGoalsQueryOptions,
  useCreateGoal as _useCreateGoal,
  useUpdateGoal as _useUpdateGoal,
  useDeleteGoal as _useDeleteGoal,
  useUpdateGoalPositions as _useUpdateGoalPositions,
  useArchiveCompletedGoals as _useArchiveCompletedGoals,
  habitsQueryOptions as _habitsQueryOptions,
  habitQueryOptions as _habitQueryOptions,
  habitTrackerQueryOptions as _habitTrackerQueryOptions,
  useCreateHabit as _useCreateHabit,
  useUpdateHabit as _useUpdateHabit,
  useDeleteHabit as _useDeleteHabit,
  useTrackHabit as _useTrackHabit,
  useUntrackHabit as _useUntrackHabit,
  journalsQueryOptions as _journalsQueryOptions,
  journalQueryOptions as _journalQueryOptions,
  journalsCountQueryOptions as _journalsCountQueryOptions,
  useCreateJournal as _useCreateJournal,
  useUpdateJournal as _useUpdateJournal,
  useDeleteJournal as _useDeleteJournal,
  projectsQueryOptions as _projectsQueryOptions,
  projectQueryOptions as _projectQueryOptions,
  projectsStatsQueryOptions as _projectsStatsQueryOptions,
  useCreateProject as _useCreateProject,
  useUpdateProject as _useUpdateProject,
  useDeleteProject as _useDeleteProject,
  useArchiveProject as _useArchiveProject,
  activityQueryOptions as _activityQueryOptions,
  searchGoalsQueryOptions as _searchGoalsQueryOptions,
  searchHabitsQueryOptions as _searchHabitsQueryOptions,
  searchJournalsQueryOptions as _searchJournalsQueryOptions,
} from "@mindtab/core";

// Goals - bind api client
export const goalsQueryOptions = (params?: Parameters<typeof _goalsQueryOptions>[1]) => _goalsQueryOptions(api, params);
export const goalQueryOptions = (id: string) => _goalQueryOptions(api, id);
export const goalsCountQueryOptions = (params?: Parameters<typeof _goalsCountQueryOptions>[1]) => _goalsCountQueryOptions(api, params);
export const unassignedGoalsQueryOptions = () => _unassignedGoalsQueryOptions(api);
export const useCreateGoal = () => _useCreateGoal(api);
export const useUpdateGoal = () => _useUpdateGoal(api);
export const useDeleteGoal = () => _useDeleteGoal(api);
export const useUpdateGoalPositions = () => _useUpdateGoalPositions(api);
export const useArchiveCompletedGoals = () => _useArchiveCompletedGoals(api);

// Habits - bind api client
export const habitsQueryOptions = () => _habitsQueryOptions(api);
export const habitQueryOptions = (id: string) => _habitQueryOptions(api, id);
export const habitTrackerQueryOptions = () => _habitTrackerQueryOptions(api);
export const useCreateHabit = () => _useCreateHabit(api);
export const useUpdateHabit = () => _useUpdateHabit(api);
export const useDeleteHabit = () => _useDeleteHabit(api);
export const useTrackHabit = () => _useTrackHabit(api);
export const useUntrackHabit = () => _useUntrackHabit(api);

// Journals - bind api client
export const journalsQueryOptions = (params?: Parameters<typeof _journalsQueryOptions>[1]) => _journalsQueryOptions(api, params);
export const journalQueryOptions = (id: string) => _journalQueryOptions(api, id);
export const journalsCountQueryOptions = () => _journalsCountQueryOptions(api);
export const useCreateJournal = () => _useCreateJournal(api);
export const useUpdateJournal = () => _useUpdateJournal(api);
export const useDeleteJournal = () => _useDeleteJournal(api);

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
export const searchGoalsQueryOptions = (query: string) => _searchGoalsQueryOptions(api, query);
export const searchHabitsQueryOptions = (query: string) => _searchHabitsQueryOptions(api, query);
export const searchJournalsQueryOptions = (query: string) => _searchJournalsQueryOptions(api, query);

// Auth stays web-specific
export { useAuth } from "./use-auth";
