import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
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
  codeFontPresets,
  normalizeAppearanceSettings,
  normalizeGeneralSettings,
  uiFontPresets,
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
import { cn } from "~/lib/utils";

type SettingsSection = "general" | "profile" | "appearance" | "shortcuts";

const sections: Array<{ id: SettingsSection; label: string; icon: ReactNode }> = [
  { id: "general", label: "General", icon: <Settings className="h-4 w-4" /> },
  { id: "profile", label: "Profile", icon: <UserCircle className="h-4 w-4" /> },
  { id: "appearance", label: "Appearance", icon: <Palette className="h-4 w-4" /> },
  { id: "shortcuts", label: "Keyboard Shortcuts", icon: <Keyboard className="h-4 w-4" /> },
];

const themeOptions: Array<{
  value: AppearanceTheme;
  label: string;
  description: string;
  background: string;
  foreground: string;
}> = [
  { value: "system", label: "System", description: "Follow this device", background: "#181818", foreground: "#FFFFFF" },
  { value: "dark", label: "Dark", description: "Always use dark mode", background: "#111111", foreground: "#FCFCFC" },
  { value: "light", label: "Light", description: "Always use light mode", background: "#FFFFFF", foreground: "#0D0D0D" },
];

type TemplateVariant = "dark" | "light";

type TemplateOption = {
  label: string;
  swatch: string;
  settings: Pick<AppearanceSettings, "appearanceTemplate" | "accentColor" | "backgroundColor" | "foregroundColor" | "contrast">;
};

const templateOptions: Record<TemplateVariant, Partial<Record<AppearanceTemplate, TemplateOption>>> = {
  light: {
    absolutely: template("Absolutely", "absolutely", "#CC7D5E", "#F9F9F7", "#2D2D2B", 45),
    catppuccin: template("Catppuccin", "catppuccin", "#8839EF", "#EFF1F5", "#4C4F69", 45),
    codex: template("Codex", "codex", "#0169CC", "#FFFFFF", "#0D0D0D", 45),
    everforest: template("Everforest", "everforest", "#93B259", "#FDF6E3", "#5C6A72", 45),
    github: template("GitHub", "github", "#0969DA", "#FFFFFF", "#1F2328", 45),
    gruvbox: template("Gruvbox", "gruvbox", "#458588", "#FBF1C7", "#3C3836", 45),
    linear: template("Linear", "linear", "#5E6AD2", "#F7F8FA", "#2A3140", 45),
    notion: template("Notion", "notion", "#3183D8", "#FFFFFF", "#37352F", 45),
    one: template("One", "one", "#526FFF", "#FAFAFA", "#383A42", 45),
    proof: template("Proof", "proof", "#3D755D", "#F5F3ED", "#2F312D", 45),
    "rose-pine": template("Rose Pine", "rose-pine", "#D7827E", "#FAF4ED", "#575279", 45),
    solarized: template("Solarized", "solarized", "#B58900", "#FDF6E3", "#657B83", 45),
    "vscode-plus": template("VS Code Plus", "vscode-plus", "#007ACC", "#FFFFFF", "#000000", 45),
  },
  dark: {
    absolutely: template("Absolutely", "absolutely", "#CC7D5E", "#2D2D2B", "#F9F9F7", 60),
    ayu: template("Ayu", "ayu", "#E6B450", "#0B0E14", "#BFBDB6", 60),
    catppuccin: template("Catppuccin", "catppuccin", "#CBA6F7", "#1E1E2E", "#CDD6F4", 60),
    codex: template("Codex", "codex", "#0169CC", "#111111", "#FCFCFC", 60),
    dracula: template("Dracula", "dracula", "#FF79C6", "#282A36", "#F8F8F2", 60),
    everforest: template("Everforest", "everforest", "#A7C080", "#2D353B", "#D3C6AA", 60),
    github: template("GitHub", "github", "#1F6FEB", "#0D1117", "#E6EDF3", 60),
    gruvbox: template("Gruvbox", "gruvbox", "#458588", "#282828", "#EBDBB2", 60),
    linear: template("Linear", "linear", "#5E6AD2", "#17181D", "#E6E9EF", 60),
    lobster: template("Lobster", "lobster", "#FF5C5C", "#111827", "#E4E4E7", 60),
    material: template("Material", "material", "#80CBC4", "#212121", "#EEFFFF", 60),
    matrix: template("Matrix", "matrix", "#1EFF5A", "#040805", "#B8FFCA", 60),
    monokai: template("Monokai", "monokai", "#99947C", "#272822", "#F8F8F2", 60),
    "night-owl": template("Night Owl", "night-owl", "#44596B", "#011627", "#D6DEEB", 60),
    nord: template("Nord", "nord", "#88C0D0", "#2E3440", "#D8DEE9", 60),
    notion: template("Notion", "notion", "#3183D8", "#191919", "#D9D9D8", 60),
    one: template("One", "one", "#4D78CC", "#282C34", "#ABB2BF", 60),
    oscurange: template("Oscurange", "oscurange", "#F9B98C", "#0B0B0F", "#E6E6E6", 60),
    "rose-pine": template("Rose Pine", "rose-pine", "#EA9A97", "#232136", "#E0DEF4", 60),
    sentry: template("Sentry", "sentry", "#7055F6", "#2D2935", "#E6DFF9", 60),
    solarized: template("Solarized", "solarized", "#D30102", "#002B36", "#839496", 60),
    temple: template("Temple", "temple", "#E4F222", "#02120C", "#C7E6DA", 60),
    "tokyo-night": template("Tokyo Night", "tokyo-night", "#3D59A1", "#1A1B26", "#A9B1D6", 60),
    "vscode-plus": template("VS Code Plus", "vscode-plus", "#007ACC", "#1E1E1E", "#D4D4D4", 60),
  },
};

function template(
  label: string,
  appearanceTemplate: AppearanceTemplate,
  accentColor: string,
  backgroundColor: string,
  foregroundColor: string,
  contrast: number
): TemplateOption {
  return {
    label,
    swatch: accentColor,
    settings: {
      appearanceTemplate,
      accentColor,
      backgroundColor,
      foregroundColor,
      contrast,
    },
  };
}

function getTemplateVariant(theme: AppearanceTheme, prefersDark: boolean): TemplateVariant {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

function resolveTemplateSettings(
  theme: AppearanceTheme,
  appearanceTemplate: AppearanceTemplate,
  variant: TemplateVariant
): Partial<AppearanceSettings> {
  const resolvedTemplate = templateOptions[variant][appearanceTemplate] ?? templateOptions[variant].codex!;
  return {
    theme,
    ...resolvedTemplate.settings,
  };
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
  const { user, isAuthenticated, isLoading, updateAppearance } = useAuth();
  const setAppearance = useAppStore((state) => state.setAppearance);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [searchQuery, setSearchQuery] = useState("");
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

  const commitSettings = async (next: Partial<AppearanceSettings & GeneralSettings>) => {
    const nextDraft = { ...draft, ...next };
    setDraft(nextDraft);
    setAppearance(next);

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
  };

  if (isLoading) {
    return <LoadingState className="h-screen bg-background" label="Loading settings" />;
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <SettingsShell className="h-screen grid-cols-[292px_minmax(0,1fr)] overflow-hidden">
      <SettingsSidebar className="bg-[var(--bg-elev)]/80 px-0 py-0">
        <div className="flex h-11 items-center gap-2 px-4">
          <span className="size-3 rounded-full bg-[var(--rose)]" />
          <span className="size-3 rounded-full bg-[var(--amber)]" />
          <span className="size-3 rounded-full bg-[var(--green)]" />
        </div>
        <div className="px-3 pb-3">
          <SettingsBackButton onClick={() => void navigate({ to: "/" })} className="justify-start px-2">
            <ArrowLeft className="h-4 w-4" />
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
                onClick={() => setActiveSection(section.id)}
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
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-10 py-12">
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
  const templateVariant = getTemplateVariant(draft.theme, prefersDark);
  const availableTemplates = appearanceTemplates.filter((templateName) => templateOptions[templateVariant][templateName]);
  const selectedTemplate = availableTemplates.includes(draft.appearanceTemplate) ? draft.appearanceTemplate : "codex";
  const currentTemplate = templateOptions[templateVariant][selectedTemplate] ?? templateOptions[templateVariant].codex!;
  const handleModeChange = (theme: AppearanceTheme) => {
    const nextVariant = getTemplateVariant(theme, prefersDark);
    onChange(resolveTemplateSettings(theme, draft.appearanceTemplate, nextVariant));
  };

  return (
    <SettingsPanel title="Appearance" description="Tune MindTab’s theme, color, and typography.">
      <div className="grid gap-4 md:grid-cols-3">
        {themeOptions.map((theme) => (
          <button
            key={theme.value}
            type="button"
            onClick={() => handleModeChange(theme.value)}
            className={cn(
              "rounded-[var(--r-4)] border border-border bg-[var(--bg-elev)] p-2 text-left transition-colors hover:border-[var(--border-2)]",
              draft.theme === theme.value && "border-primary ring-1 ring-primary/40"
            )}
          >
            <div className="h-28 overflow-hidden rounded-[var(--r-3)] border border-border" style={{ background: theme.background }}>
              <div className="h-full p-4">
                <div className="mb-4 h-2 w-1/2 rounded-full opacity-25" style={{ background: theme.foreground }} />
                <div className="rounded-[var(--r-3)] p-3" style={{ background: mixForPreview(theme.background, theme.foreground, 0.12) }}>
                  <div className="mb-3 h-2 w-20 rounded-full opacity-25" style={{ background: theme.foreground }} />
                  <div className="space-y-2">
                    <div className="h-px opacity-15" style={{ background: theme.foreground }} />
                    <div className="h-px opacity-15" style={{ background: theme.foreground }} />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-2 px-1">
              <div>
                <Text as="div">{theme.label}</Text>
                <MetaText as="div">{theme.description}</MetaText>
              </div>
              {draft.theme === theme.value && <Check className="h-4 w-4 text-primary" />}
            </div>
          </button>
        ))}
      </div>

      <SettingsCard>
        <SettingsRow label="Template" icon={<Sparkles className="h-4 w-4" />}>
          <Select
            value={selectedTemplate}
            onValueChange={(value) => onChange({
              theme: draft.theme,
              ...templateOptions[templateVariant][value as AppearanceTemplate]!.settings,
            })}
          >
            <SelectTrigger className="h-9 w-[220px]">
              <span className="flex items-center gap-2">
                <span className="flex size-6 items-center justify-center rounded-[var(--r-2)] bg-background">
                  <span className="size-3 rounded-full" style={{ background: currentTemplate.swatch }} />
                </span>
                <SelectValue />
              </span>
            </SelectTrigger>
            <SelectContent>
              {availableTemplates.map((template) => (
                <SelectItem key={template} value={template}>
                  {templateOptions[templateVariant][template]!.label}
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
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uiFontPresets.map((font) => (
                <SelectItem key={font} value={font}>{labelize(font)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>
        <SettingsRow label="Code font">
          <Select value={draft.codeFont} onValueChange={(codeFont) => onChange({ codeFont: codeFont as CodeFontPreset })}>
            <SelectTrigger className="h-9 w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {codeFontPresets.map((font) => (
                <SelectItem key={font} value={font}>{labelize(font)}</SelectItem>
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
      </SettingsCard>
    </SettingsPanel>
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

function labelize(value: string) {
  return value
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function mixForPreview(from: string, to: string, amount: number) {
  const a = parseColor(from);
  const b = parseColor(to);
  return `rgb(${Math.round(a.r + (b.r - a.r) * amount)}, ${Math.round(a.g + (b.g - a.g) * amount)}, ${Math.round(a.b + (b.b - a.b) * amount)})`;
}

function parseColor(hex: string) {
  const normalized = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "0F0F11";
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}
