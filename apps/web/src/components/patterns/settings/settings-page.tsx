import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Clock3,
  Globe2,
  Keyboard,
  Palette,
  Search,
  Settings,
  Sparkles,
  UserCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  appearanceTemplates,
  normalizeAppearanceSettings,
  normalizeGeneralSettings,
  useAppStore,
  type AppearanceSettings,
  type AppearanceTemplate,
  type AppearanceTheme,
  type CodeFontPreset,
  type GeneralSettings,
  type TimeFormat,
  type UIFontPreset,
  type WeekStartDay,
} from "@mindtab/core";
import {
  conversationsQueryOptions,
  notesCountQueryOptions,
  tasksCountQueryOptions,
  useAuth,
  type User,
} from "~/api/hooks";
import { Button } from "~/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "~/components/ui/select";
import { CodeText, Heading, MetaText, Text } from "~/components/ui/typography";
import { LoadingState, StatCell as ProfileStatCell } from "~/components/patterns";
import {
  ColorControl,
  RangeControl,
  SettingsBackButton,
  SettingsCard,
  SettingsNavItem,
  SettingsPanel as SettingsMainPanel,
  SettingsRow,
  SettingsScrollArea,
  SettingsSection as SettingsPanel,
  SettingsShell,
  SettingsSidebar,
} from "~/components/patterns/settings";
import { SidebarAccountItem, SidebarAccountMenu } from "~/components/domain/navigation";
import {
  appearanceTemplateOptions,
  appearanceThemeOptions,
  codeFontOptions,
  getTemplateVariant,
  resolveAppearanceTemplateSettings,
  type TemplateOption,
  uiFontOptions,
} from "~/lib/appearance";
import { cn } from "~/lib/utils";

type SettingsSection = "general" | "profile" | "appearance" | "shortcuts";
type SettingsPatch = Partial<AppearanceSettings & GeneralSettings>;

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
  { id: "profile", label: "Profile", icon: <UserCircle className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: <Keyboard className="h-4 w-4" /> },
];

const debouncedAppearanceKeys = new Set<keyof AppearanceSettings>(["contrast", "fontSize", "radius"]);
const settingsSaveDelayMs = 600;

function shouldDebounceSettingsPatch(next: SettingsPatch) {
  const keys = Object.keys(next) as Array<keyof SettingsPatch>;
  return keys.length > 0 && keys.every((key) => debouncedAppearanceKeys.has(key as keyof AppearanceSettings));
}

function usePrefersDark() {
  const [prefersDark, setPrefersDark] = useState(() =>
    typeof window === "undefined" ? true : window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setPrefersDark(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  return prefersDark;
}

const timeZoneOptions = [
  { value: "auto", label: "Auto" },
  { value: "Asia/Kolkata", label: "Asia/Kolkata" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New York" },
  { value: "America/Los_Angeles", label: "America/Los Angeles" },
  { value: "Europe/London", label: "Europe/London" },
];

const shortcutGroups = [
  {
    label: "Navigation",
    items: [
      ["Command menu", "⌘ K"],
      ["New chat", "⇧ ⌘ N"],
      ["Search", "⌘ /"],
      ["Back to app", "Esc"],
    ],
  },
  {
    label: "Work",
    items: [
      ["Create task", "N"],
      ["Open calendar", "C"],
      ["Open notes", "G N"],
      ["Open vault", "G V"],
    ],
  },
];

export function SettingsPage() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { section?: string };
  const { user, isAuthenticated, isLoading, updateAppearance } = useAuth();
  const setAppearance = useAppStore((state) => state.setAppearance);
  const activeSection = getSettingsSection(search.section);
  const [searchQuery, setSearchQuery] = useState("");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSaveRef = useRef<SettingsPatch>({});
  const [draft, setDraft] = useState<(AppearanceSettings & GeneralSettings)>(() => ({
    ...normalizeAppearanceSettings(null),
    ...normalizeGeneralSettings(null),
  }));

  const { data: taskCount = 0 } = useQuery({ ...tasksCountQueryOptions({ includeArchived: true }), enabled: isAuthenticated });
  const { data: noteCount = 0 } = useQuery({ ...notesCountQueryOptions(), enabled: isAuthenticated });
  const { data: conversationData } = useQuery({ ...conversationsQueryOptions({ limit: 1, offset: 0 }), enabled: isAuthenticated });

  useEffect(() => {
    if (!isLoading && (!isAuthenticated || !user)) {
      void navigate({ to: "/login" });
    }
  }, [isAuthenticated, isLoading, navigate, user]);

  useEffect(() => {
    if (!user) return;
    setDraft({
      ...normalizeAppearanceSettings(user),
      ...normalizeGeneralSettings(user),
    });
  }, [user]);

  const filteredSections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return sections;
    return sections.filter((section) => section.label.toLowerCase().includes(query));
  }, [searchQuery]);

  const persistSettings = useCallback(async (next: SettingsPatch) => {
    if (Object.keys(next).length === 0) return;

    try {
      await updateAppearance(next);
    } catch {
      toast.error("Failed to save settings");
      if (user) {
        const restored = {
          ...normalizeAppearanceSettings(user),
          ...normalizeGeneralSettings(user),
        };
        setDraft(restored);
        setAppearance(restored);
      }
    }
  }, [setAppearance, updateAppearance, user]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    const pendingSave = pendingSaveRef.current;
    pendingSaveRef.current = {};
    if (Object.keys(pendingSave).length > 0) {
      void persistSettings(pendingSave);
    }
  }, [persistSettings]);

  const commitSettings = (next: SettingsPatch) => {
    setDraft((currentDraft) => ({ ...currentDraft, ...next }));
    setAppearance(next);

    if (shouldDebounceSettingsPatch(next)) {
      pendingSaveRef.current = { ...pendingSaveRef.current, ...next };
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const pendingSave = pendingSaveRef.current;
        pendingSaveRef.current = {};
        saveTimerRef.current = null;
        void persistSettings(pendingSave);
      }, settingsSaveDelayMs);
      return;
    }

    const immediateSave = { ...pendingSaveRef.current, ...next };
    pendingSaveRef.current = {};
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    void persistSettings(immediateSave);
  };

  if (isLoading) {
    return <LoadingState className="h-screen bg-background" label="Loading settings" />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <SettingsShell className="h-screen grid-cols-[292px_minmax(0,1fr)] overflow-hidden">
      <SettingsSidebar className="px-0 py-0">
        <div className="px-3 pb-3 pt-4">
          <SettingsBackButton
            onClick={() => void navigate({ to: "/" })}
            icon={<ArrowLeft className="h-4 w-4" />}
            className="gap-3 px-2"
          >
            <span>Back to app</span>
          </SettingsBackButton>
          <div className="mt-3 flex h-9 items-center gap-2 rounded-[var(--r-3)] border border-border bg-background px-3 text-muted-foreground">
            <Search className="h-4 w-4 shrink-0" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search settings..."
              className="min-w-0 flex-1 bg-transparent text-[length:var(--type-body-size)] outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <SettingsScrollArea className="custom-scrollbar px-3 py-3">
          <MetaText as="div" className="mb-2 px-2">Personal</MetaText>
          <nav className="space-y-1">
            {filteredSections.map((section) => (
              <SettingsNavItem
                key={section.id}
                onClick={() => void navigate({ to: "/settings", search: { section: section.id } })}
                active={activeSection === section.id}
                icon={section.icon}
                className="gap-3 px-2"
              >
                {section.label}
              </SettingsNavItem>
            ))}
          </nav>
        </SettingsScrollArea>
        <SidebarAccountMenu>
          <SidebarAccountItem user={user} />
        </SidebarAccountMenu>
      </SettingsSidebar>

      <SettingsMainPanel className="custom-scrollbar px-0 py-0">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-10 py-12">
          {activeSection === "general" && (
            <GeneralSettingsSection draft={draft} onChange={commitSettings} />
          )}
          {activeSection === "profile" && (
            <ProfileSettingsSection
              user={user}
              taskCount={taskCount}
              noteCount={noteCount}
              chatCount={(conversationData as { total?: number } | undefined)?.total ?? 0}
            />
          )}
          {activeSection === "appearance" && (
            <AppearanceSettingsSection draft={draft} onChange={commitSettings} />
          )}
          {activeSection === "shortcuts" && <KeyboardShortcutsSection />}
        </div>
      </SettingsMainPanel>
    </SettingsShell>
  );
}

function getSettingsSection(value?: string): SettingsSection {
  return sections.some((section) => section.id === value) ? value as SettingsSection : "appearance";
}

function GeneralSettingsSection({
  draft,
  onChange,
}: {
  draft: AppearanceSettings & GeneralSettings;
  onChange: (next: Partial<GeneralSettings>) => void;
}) {
  return (
    <SettingsPanel title="General" description="A small set of defaults for how time and dates should appear across MindTab.">
      <SettingsCard>
        <SettingsRow label="Week starts on" icon={<CalendarDays className="h-4 w-4" />}>
          <Select value={draft.weekStartDay} onValueChange={(value) => onChange({ weekStartDay: value as WeekStartDay })}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monday">Monday</SelectItem>
              <SelectItem value="sunday">Sunday</SelectItem>
              <SelectItem value="saturday">Saturday</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Time format" icon={<Clock3 className="h-4 w-4" />}>
          <Select value={draft.timeFormat} onValueChange={(value) => onChange({ timeFormat: value as TimeFormat })}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="12h">12-hour</SelectItem>
              <SelectItem value="24h">24-hour</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Time zone" icon={<Globe2 className="h-4 w-4" />}>
          <Select value={draft.timeZone} onValueChange={(value) => onChange({ timeZone: value })}>
            <SelectTrigger className="h-9 w-[190px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {timeZoneOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsCard>
    </SettingsPanel>
  );
}

function ProfileSettingsSection({
  user,
  taskCount,
  noteCount,
  chatCount,
}: {
  user: User;
  taskCount: number;
  noteCount: number;
  chatCount: number;
}) {
  return (
    <SettingsPanel title="Profile" description="Your public account basics and lifetime workstation activity.">
      <SettingsCard>
        <div className="flex items-center gap-5 border-b border-border p-5">
          <ProfileAvatar user={user} className="size-16" />
          <div className="min-w-0">
            <Heading as="h2" variant="section" className="truncate">{user.name || "MindTab user"}</Heading>
            <Text variant="muted" className="truncate">{user.email}</Text>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-border">
          <ProfileStatCell label="Lifetime tasks" value={taskCount.toLocaleString()} className="rounded-none border-0 bg-transparent p-5" />
          <ProfileStatCell label="Notes" value={noteCount.toLocaleString()} className="rounded-none border-0 bg-transparent p-5" />
          <ProfileStatCell label="Chats" value={chatCount.toLocaleString()} className="rounded-none border-0 bg-transparent p-5" />
        </div>
      </SettingsCard>
    </SettingsPanel>
  );
}

function AppearanceSettingsSection({
  draft,
  onChange,
}: {
  draft: AppearanceSettings & GeneralSettings;
  onChange: (next: Partial<AppearanceSettings>) => void;
}) {
  const prefersDark = usePrefersDark();
  const templateVariant = getVisibleTemplateVariant(draft.backgroundColor, draft.theme, prefersDark);
  const availableTemplates = appearanceTemplates.filter((templateName) => appearanceTemplateOptions[templateVariant][templateName]);
  const selectedTemplate = availableTemplates.includes(draft.appearanceTemplate) ? draft.appearanceTemplate : "codex";
  const currentTemplate = appearanceTemplateOptions[templateVariant][selectedTemplate] ?? appearanceTemplateOptions[templateVariant].codex!;
  const handleModeChange = (theme: AppearanceTheme) => {
    onChange(resolveAppearanceTemplateSettings(theme, draft.appearanceTemplate, prefersDark));
  };

  return (
    <SettingsPanel title="Appearance" gap="xl">
      <div className="grid gap-6 md:grid-cols-3">
        {appearanceThemeOptions.map((theme) => (
          <button
            key={theme.value}
            type="button"
            onClick={() => handleModeChange(theme.value)}
            className="group min-w-0 text-center"
          >
            <ThemeModePreview theme={theme.value} selected={draft.theme === theme.value} />
            <Text
              as="div"
              variant={draft.theme === theme.value ? "body" : "muted"}
              className="mt-4 transition-colors group-hover:text-foreground"
            >
              {theme.label}
            </Text>
          </button>
        ))}
      </div>

      <SettingsCard>
        <SettingsRow label="Template" icon={<Sparkles className="h-4 w-4" />}>
          <Select
            value={selectedTemplate}
            onValueChange={(value) => onChange({
              theme: draft.theme,
              ...appearanceTemplateOptions[templateVariant][value as AppearanceTemplate]!.settings,
            })}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <span className="flex items-center gap-2">
                <TemplatePreviewMark template={currentTemplate} />
                <span>{currentTemplate.label}</span>
              </span>
            </SelectTrigger>
            <SelectContent>
              {availableTemplates.map((template) => (
                <SelectItem key={template} value={template}>
                  <span className="flex min-w-0 items-center gap-3">
                    <TemplatePreviewMark template={appearanceTemplateOptions[templateVariant][template]!} />
                    <span className="truncate">{appearanceTemplateOptions[templateVariant][template]!.label}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Accent">
          <ColorControl value={draft.accentColor} onChange={(accentColor) => onChange({ accentColor })} />
        </SettingsRow>
        <SettingsRow label="Background">
          <ColorControl value={draft.backgroundColor} onChange={(backgroundColor) => onChange({ backgroundColor })} />
        </SettingsRow>
        <SettingsRow label="Foreground">
          <ColorControl value={draft.foregroundColor} onChange={(foregroundColor) => onChange({ foregroundColor })} />
        </SettingsRow>
        <SettingsRow label="UI font">
          <Select value={draft.uiFont} onValueChange={(uiFont) => onChange({ uiFont: uiFont as UIFontPreset })}>
            <SelectTrigger className="h-9 w-[220px]">
              <FontOptionLabel option={uiFontOptions.find((font) => font.value === draft.uiFont) ?? uiFontOptions[0]} />
            </SelectTrigger>
            <SelectContent>
              {uiFontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  <FontOptionLabel option={font} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Code font">
          <Select value={draft.codeFont} onValueChange={(codeFont) => onChange({ codeFont: codeFont as CodeFontPreset })}>
            <SelectTrigger className="h-9 w-[220px]">
              <FontOptionLabel option={codeFontOptions.find((font) => font.value === draft.codeFont) ?? codeFontOptions[0]} />
            </SelectTrigger>
            <SelectContent>
              {codeFontOptions.map((font) => (
                <SelectItem key={font.value} value={font.value}>
                  <FontOptionLabel option={font} />
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Contrast">
          <RangeControl value={draft.contrast} min={0} max={100} suffix="" onChange={(contrast) => onChange({ contrast })} />
        </SettingsRow>
        <SettingsRow label="Font size">
          <RangeControl value={draft.fontSize} min={12} max={20} suffix="px" onChange={(fontSize) => onChange({ fontSize })} />
        </SettingsRow>
        <SettingsRow label="Radius">
          <RangeControl value={draft.radius} min={0} max={20} suffix="px" onChange={(radius) => onChange({ radius })} />
        </SettingsRow>
      </SettingsCard>
    </SettingsPanel>
  );
}

function TemplatePreviewMark({ template }: { template: TemplateOption }) {
  const { accentColor, backgroundColor, foregroundColor } = template.settings;

  return (
    <span
      className="flex size-7 shrink-0 items-center justify-center rounded-[var(--r-2)] border text-[length:var(--type-meta-size)] font-[var(--type-label-weight)] leading-none"
      style={{
        backgroundColor,
        borderColor: accentColor,
        color: accentColor,
        boxShadow: `inset 0 0 0 1px ${toPreviewBorder(foregroundColor, backgroundColor)}`,
      }}
      aria-hidden="true"
    >
      Aa
    </span>
  );
}

function FontOptionLabel<T extends UIFontPreset | CodeFontPreset>({ option }: { option: { value: T; label: string } }) {
  return (
    <span className="truncate" style={{ fontFamily: getFontPreviewStack(option.value) }}>
      {option.label}
    </span>
  );
}

function getFontPreviewStack(font: UIFontPreset | CodeFontPreset) {
  switch (font) {
    case "geist":
      return '"Geist", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    case "inter":
      return 'Inter, "Inter Variable", "Geist", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    case "sf-pro":
      return '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    case "helvetica":
      return '"Helvetica Neue", Helvetica, Arial, sans-serif';
    case "avenir":
      return 'Avenir, "Avenir Next", "Helvetica Neue", Arial, sans-serif';
    case "ibm-plex":
      return '"IBM Plex Sans", "Geist", -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
    case "roboto":
      return 'Roboto, "Geist", Arial, sans-serif';
    case "segoe":
      return '"Segoe UI", "Geist", Arial, sans-serif';
    case "geist-mono":
      return '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case "system-mono":
      return 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case "sf-mono":
      return '"SF Mono", SFMono-Regular, ui-monospace, Menlo, Monaco, Consolas, monospace';
    case "jetbrains":
      return '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case "fira-code":
      return '"Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    case "cascadia":
      return '"Cascadia Code", "Cascadia Mono", ui-monospace, Consolas, monospace';
    case "menlo":
      return 'Menlo, Monaco, Consolas, ui-monospace, monospace';
    case "monaco":
      return 'Monaco, Menlo, Consolas, ui-monospace, monospace';
    default:
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  }
}

function getVisibleTemplateVariant(backgroundColor: string, theme: AppearanceTheme, prefersDark: boolean) {
  if (/^#[0-9a-fA-F]{6}$/.test(backgroundColor)) {
    const hex = backgroundColor.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    return luminance > 0.55 ? "light" : "dark";
  }

  return getTemplateVariant(theme, prefersDark);
}

function toPreviewBorder(foregroundColor: string, backgroundColor: string) {
  return `color-mix(in srgb, ${foregroundColor} 20%, ${backgroundColor})`;
}

function ThemeModePreview({ theme, selected }: { theme: AppearanceTheme; selected: boolean }) {
  if (theme === "system") {
    return (
      <div
        className={cn(
          "relative h-40 overflow-hidden rounded-[var(--r-5)] border border-border transition-colors group-hover:border-[var(--border-2)]",
          selected && "border-primary ring-1 ring-primary/60"
        )}
      >
        <div className="absolute inset-0 grid grid-cols-2">
          <div className="bg-[#EDEDED]" />
          <div className="bg-[#3A3A39]" />
        </div>
        <div className="absolute inset-x-5 bottom-0 h-[72%] overflow-hidden rounded-t-[var(--r-5)] bg-[#F7F7F7] shadow-sm">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-[#333332]" />
          <div className="absolute left-[36%] top-[42%] h-3 w-16 rounded-full bg-[#C8C8C8]" />
          <div className="absolute left-[26%] top-[52%] h-1.5 w-36 rounded-full bg-[#DCDCDC]" />
          <div className="absolute bottom-8 left-6 h-3 w-24 rounded-full bg-[#D7D7D7]" />
          <div className="absolute bottom-8 right-6 h-3 w-24 rounded-full bg-[#797978]" />
        </div>
      </div>
    );
  }

  const dark = theme === "dark";

  return (
    <div
      className={cn(
        "relative h-40 overflow-hidden rounded-[var(--r-5)] border border-border transition-colors group-hover:border-[var(--border-2)]",
        dark ? "bg-[#5E5E5C]" : "bg-[#F4F4F4]",
        selected && "border-primary ring-1 ring-primary/60"
      )}
    >
      <div className="absolute inset-x-14 top-5 h-3 rounded-full bg-black/15" />
      <div className="absolute inset-x-20 top-9 h-2 rounded-full bg-black/10" />
      <div className="absolute inset-x-10 bottom-0 h-[64%] overflow-hidden rounded-t-[var(--r-5)] bg-white">
        <div className="p-5">
          <div className="mb-5 h-3 w-28 rounded-full bg-black/15" />
          <div className="mb-5 h-px bg-black/5" />
          <div className="mb-3 h-3 w-28 rounded-full bg-black/15" />
          <div className="mb-5 h-px bg-black/5" />
          <div className="h-3 w-28 rounded-full bg-black/15" />
        </div>
      </div>
    </div>
  );
}

function KeyboardShortcutsSection() {
  return (
    <SettingsPanel title="Keyboard Shortcuts" description="Current shortcuts are read-only. Customization will come later.">
      <div className="grid gap-4 md:grid-cols-2">
        {shortcutGroups.map((group) => (
          <SettingsCard key={group.label}>
            <div className="border-b border-border px-4 py-3">
              <Heading as="h2" variant="panel">{group.label}</Heading>
            </div>
            <div className="divide-y divide-border">
              {group.items.map(([label, shortcut]) => (
                <div key={label} className="flex items-center justify-between gap-4 px-4 py-3">
                  <Text>{label}</Text>
                  <CodeText className="text-foreground">{shortcut}</CodeText>
                </div>
              ))}
            </div>
          </SettingsCard>
        ))}
      </div>
    </SettingsPanel>
  );
}

function ProfileAvatar({ user, className }: { user: Pick<User, "name" | "image">; className?: string }) {
  return (
    <div className={cn("shrink-0 overflow-hidden rounded-full border border-border bg-secondary", className)}>
      {user.image ? (
        <img src={user.image} alt={user.name || "Profile"} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-foreground">
          {(user.name || "M").slice(0, 1).toUpperCase()}
        </div>
      )}
    </div>
  );
}
