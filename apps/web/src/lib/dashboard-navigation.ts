import * as React from "react";
import { EActiveLayout, type ActiveLayout } from "@mindtab/core";
import { useNavigate, useRouterState } from "@tanstack/react-router";

export const DASHBOARD_VIEWS = ["tasks", "notes", "calendar"] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export type DashboardSearch = {
  view?: DashboardView;
  project?: string;
};

const layoutByView: Record<DashboardView, ActiveLayout> = {
  tasks: EActiveLayout.Tasks,
  notes: EActiveLayout.Notes,
  calendar: EActiveLayout.Calendar,
};

const viewByLayout: Record<ActiveLayout, DashboardView> = {
  [EActiveLayout.Tasks]: "tasks",
  [EActiveLayout.Notes]: "notes",
  [EActiveLayout.Calendar]: "calendar",
};

export function normalizeDashboardSearch(search: Record<string, unknown>): DashboardSearch {
  const view = DASHBOARD_VIEWS.includes(search.view as DashboardView)
    ? search.view as DashboardView
    : undefined;
  const project = typeof search.project === "string" && search.project.trim()
    ? search.project
    : undefined;

  return {
    ...(view ? { view } : {}),
    ...(project && view !== "calendar" ? { project } : {}),
  };
}

export function useDashboardNavigation() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (state) => state.location });
  const search = normalizeDashboardSearch(location.search as Record<string, unknown>);
  const isDashboard = location.pathname === "/";
  const view = isDashboard ? search.view ?? "tasks" : "tasks";
  const activeElement = layoutByView[view];
  const activeProjectId = isDashboard && view !== "calendar" ? search.project ?? null : null;

  const openDashboard = React.useCallback((element: ActiveLayout, projectId: string | null = null) => {
    const nextView = viewByLayout[element];
    void navigate({
      to: "/",
      search: {
        view: nextView,
        ...(projectId && nextView !== "calendar" ? { project: projectId } : {}),
      },
    });
  }, [navigate]);

  return {
    activeElement,
    activeProjectId,
    isDashboard,
    openDashboard,
    view,
  };
}
