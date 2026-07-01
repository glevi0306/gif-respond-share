import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { OrangeHeader } from "../components/orange-header";
import { BottomNav } from "../components/bottom-nav";
import { useApp } from "../lib/app-context";
import { useAuth } from "../lib/auth-context";
import { LANGUAGES } from "../lib/sec-data";
import {
  User,
  Palette,
  Globe,
  Bell,
  Lock,
  HardDrive,
  LifeBuoy,
  Sun,
  Moon,
  Monitor,
  LogOut,
  Trash2,
  ChevronRight,
  Check,
  Mail,
  FileText,
  Shield,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ title: "Settings — Sec." }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const { theme, setTheme, language, setLanguage } = useApp();
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [notif, setNotif] = useState({
    newQ: true,
    newA: true,
    friend: true,
    weekly: false,
    results: true,
  });
  const [profileVis, setProfileVis] = useState<"public" | "friends">("friends");
  const [libVis, setLibVis] = useState<"public" | "friends" | "private">("friends");
  const [gifDefault, setGifDefault] = useState<"public" | "friends" | "private">("friends");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleLogout = async () => {
    await signOut();
    // AppShell route guard will redirect to /auth once session clears
  };

  // Placeholder: real deletion requires a server-side Edge Function with service-role key.
  // For now we sign the user out so they cannot access their data.
  const handleDeleteAccount = async () => {
    await signOut();
    navigate({ to: "/auth" });
  };

  const avatarEmoji = profile?.avatar_emoji ?? "🙂";
  const username = profile?.username ?? "—";
  const bio = profile?.bio ?? "—";
  const email = user?.email ?? "—";

  return (
    <div className="pb-28">
      <OrangeHeader title="Settings" back="/profile" />

      <div className="space-y-5 px-5 pt-5">
        <Section icon={<User className="h-4 w-4" />} title="Account" emoji="👤">
          <Row
            label="Profile picture"
            right={
              <span className="grid h-9 w-9 place-items-center rounded-full bg-muted text-xl">
                {avatarEmoji}
              </span>
            }
          />
          <Row label="Username" value={`@${username}`} />
          <Row label="Bio" value={bio} />
          <Row label="Email" value={email} icon={<Mail className="h-4 w-4" />} />
          <Action onClick={handleLogout} icon={<LogOut className="h-4 w-4" />} label="Log out" />
          {!showDeleteConfirm ? (
            <Action
              danger
              icon={<Trash2 className="h-4 w-4" />}
              label="Delete account"
              onClick={() => setShowDeleteConfirm(true)}
            />
          ) : (
            <div className="px-4 py-3">
              <p className="mb-3 text-sm text-red-500">
                This will sign you out immediately. Contact support to fully remove your data.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-full border border-border py-2 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAccount}
                  className="flex-1 rounded-full bg-red-500 py-2 text-xs font-semibold text-white"
                >
                  Confirm
                </button>
              </div>
            </div>
          )}
        </Section>

        <Section icon={<Palette className="h-4 w-4" />} title="Appearance" emoji="🎨">
          <div className="grid grid-cols-3 gap-2 p-3">
            <ThemeOption
              active={theme === "light"}
              onClick={() => setTheme("light")}
              icon={<Sun className="h-4 w-4" />}
              label="Bright"
            />
            <ThemeOption
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
              icon={<Moon className="h-4 w-4" />}
              label="Dark"
            />
            <ThemeOption
              active={theme === "system"}
              onClick={() => setTheme("system")}
              icon={<Monitor className="h-4 w-4" />}
              label="System"
            />
          </div>
        </Section>

        <Section icon={<Globe className="h-4 w-4" />} title="Language" emoji="🌍">
          <div className="divide-y divide-border">
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                onClick={() => setLanguage(l.code)}
                className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors active:bg-muted/60"
              >
                <span className="flex items-center gap-2 text-sm">
                  <span>{l.flag}</span>
                  {l.label}
                </span>
                {language === l.code && <Check className="h-4 w-4 text-[var(--orange)]" />}
              </button>
            ))}
          </div>
        </Section>

        <Section icon={<Bell className="h-4 w-4" />} title="Notifications" emoji="🔔">
          <Toggle
            label="New question received"
            on={notif.newQ}
            onChange={(v) => setNotif({ ...notif, newQ: v })}
          />
          <Toggle
            label="New answer received"
            on={notif.newA}
            onChange={(v) => setNotif({ ...notif, newA: v })}
          />
          <Toggle
            label="Friend joined Sec."
            on={notif.friend}
            onChange={(v) => setNotif({ ...notif, friend: v })}
          />
          <Toggle
            label="Weekly challenge starts"
            on={notif.weekly}
            onChange={(v) => setNotif({ ...notif, weekly: v })}
          />
          <Toggle
            label="Weekly results available"
            on={notif.results}
            onChange={(v) => setNotif({ ...notif, results: v })}
          />
        </Section>

        <Section icon={<Lock className="h-4 w-4" />} title="Privacy" emoji="🔒">
          <Group label="Profile visibility">
            <Segment
              value={profileVis}
              onChange={setProfileVis}
              options={[
                ["public", "Public"],
                ["friends", "Friends only"],
              ]}
            />
          </Group>
          <Group label="GIF Library visibility">
            <Segment
              value={libVis}
              onChange={setLibVis}
              options={[
                ["public", "Public"],
                ["friends", "Friends"],
                ["private", "Private"],
              ]}
            />
          </Group>
          <Group label="Default GIF privacy">
            <Segment
              value={gifDefault}
              onChange={setGifDefault}
              options={[
                ["public", "Public"],
                ["friends", "Friends"],
                ["private", "Private"],
              ]}
            />
          </Group>
        </Section>

        <Section icon={<HardDrive className="h-4 w-4" />} title="Storage" emoji="💾">
          <Row label="Average GIF size" value="~200 KB" />
          <Action icon={<Trash2 className="h-4 w-4" />} label="Clear cached files" />
        </Section>

        <Section icon={<LifeBuoy className="h-4 w-4" />} title="Support" emoji="📩">
          <Action icon={<MessageCircle className="h-4 w-4" />} label="Contact us" />
          <Action icon={<Shield className="h-4 w-4" />} label="Privacy Policy" />
          <Action icon={<FileText className="h-4 w-4" />} label="Terms of Service" />
          <Row label="App version" value="Sec. v0.9 Beta" />
        </Section>
      </div>

      <BottomNav />
    </div>
  );
}

function Section({
  icon,
  title,
  emoji,
  children,
}: {
  icon: ReactNode;
  title: string;
  emoji: string;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-base">{emoji}</span>
        <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="ml-auto text-muted-foreground/60">{icon}</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  right,
  icon,
}: {
  label: string;
  value?: string;
  right?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="text-sm">{label}</span>
      </div>
      {right ?? (value && <span className="truncate text-sm text-muted-foreground">{value}</span>)}
    </div>
  );
}

function Action({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between border-b border-border px-4 py-3 text-left last:border-b-0 transition-colors active:bg-muted/60 ${danger ? "text-red-500" : ""}`}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {label}
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function Toggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
      <span className="text-sm">{label}</span>
      <button
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${on ? "bg-[var(--orange)]" : "bg-muted"}`}
        aria-pressed={on}
      >
        <span
          className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
          style={{
            transform: on ? "translateX(18px)" : "translateX(0px)",
            transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </button>
    </div>
  );
}

function ThemeOption({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-[background-color,border-color,color,transform] duration-150 active:scale-95 ${
        active ? "border-foreground bg-foreground text-background" : "border-border bg-background"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-b border-border px-4 py-3 last:border-b-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

function Segment<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: [T, string][];
}) {
  return (
    <div className="flex rounded-full bg-muted p-1">
      {options.map(([v, l]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-full px-3 py-1.5 text-xs font-semibold transition-[background-color,color,box-shadow] duration-150 active:opacity-75 ${
            value === v ? "bg-card text-foreground shadow" : "text-muted-foreground"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
