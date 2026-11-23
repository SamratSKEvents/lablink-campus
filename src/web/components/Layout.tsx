/**
 * App shell, phone first: students carry phones into labs, not laptops.
 * Phones get a compact top bar (logo, guide, alerts, account, SOS) and a thumb-reachable
 * bottom tab bar; tablets and desktops get inline navigation.
 */
import { Popover } from "@base-ui/react/popover";
import { useIsFetching, useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  ChartLine,
  FlaskConical,
  FolderKanban,
  LogOut,
  Map,
  Scale,
  Search,
  ShieldCheck,
  Siren,
  Stamp,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { Role } from "@shared/domain";
import { api, post } from "../lib/api";
import { useSession } from "../lib/auth";
import { SosButton, useDefaultSosContext } from "./Sos";
import { JudgeTour } from "./JudgeTour";
import { BackgroundDoodles } from "./Doodles";

type NavItem = { to: string; label: string; short: string; icon: LucideIcon };

const NAV: Record<Role, NavItem[]> = {
  student: [
    { to: "/projects", label: "My projects", short: "Projects", icon: FolderKanban },
    { to: "/discover", label: "Discover", short: "Discover", icon: Search },
    { to: "/session", label: "Lab session", short: "Session", icon: FlaskConical },
    { to: "/map", label: "Lab map", short: "Map", icon: Map },
    { to: "/safety", label: "Safety", short: "Safety", icon: ShieldCheck },
  ],
  faculty: [
    { to: "/approvals", label: "Approvals", short: "Approvals", icon: Stamp },
    { to: "/projects", label: "Student projects", short: "Projects", icon: FolderKanban },
    { to: "/admin", label: "Fairness", short: "Fairness", icon: Scale },
    { to: "/incidents", label: "Incidents", short: "Alerts", icon: Siren },
  ],
  technician: [
    { to: "/tech", label: "Today", short: "Today", icon: Wrench },
    { to: "/incidents", label: "Incidents", short: "Alerts", icon: Siren },
    { to: "/map", label: "Lab map", short: "Map", icon: Map },
    { to: "/discover", label: "Equipment", short: "Equipment", icon: Search },
  ],
  admin: [
    { to: "/admin", label: "Overview", short: "Overview", icon: ChartLine },
    { to: "/projects", label: "Projects", short: "Projects", icon: FolderKanban },
    { to: "/map", label: "Lab map", short: "Map", icon: Map },
    { to: "/incidents", label: "Incidents", short: "Alerts", icon: Siren },
  ],
  security: [{ to: "/incidents", label: "Incidents", short: "Alerts", icon: Siren }],
};

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl leading-none" aria-label="LabLink">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true" className="shrink-0">
        <rect width="64" height="64" rx="16" fill="var(--yellow)" />
        <path d="M22 16h8v26h14v8H22z" fill="var(--ink-900)" />
        <circle cx="46" cy="20" r="6" fill="var(--green)" />
      </svg>
      {/* Cal Sans sits slightly low in its line box; nudge it onto the icon's centre line. */}
      <span className="relative -top-px">LabLink</span>
    </span>
  );
}

export function Layout() {
  const { user, kiosk, signOut } = useSession();
  const sos = useDefaultSosContext();
  // Signed out: still render the route, so its guard can redirect to sign-in.
  if (!user) return <Outlet />;
  const links = kiosk ? NAV.student.filter((l) => l.to === "/session") : NAV[user.role];
  return <Shell links={links} kiosk={kiosk} name={user.name} role={user.role} signOut={signOut} sos={sos} />;
}

function Shell({
  links,
  kiosk,
  name,
  role,
  signOut,
  sos,
}: {
  links: NavItem[];
  kiosk: boolean;
  name: string;
  role: Role;
  signOut: () => Promise<void>;
  sos: ReturnType<typeof useDefaultSosContext>;
}) {
  // Background polls (notifications, live maps) shouldn't flash the loading bar.
  const POLLS = ["notifications", "labs", "incidents", "my-bookings"];
  const busy = useIsFetching({ predicate: (q) => !POLLS.includes(String(q.queryKey[0])) }) + useIsMutating() > 0;
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link btn btn-primary">
        Skip to content
      </a>
      <BackgroundDoodles />
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
        {busy && <div className="topbar" role="progressbar" aria-label="Loading" />}
        <div className="max-w-6xl mx-auto px-4 h-16 md:h-[72px] flex items-center gap-3 md:gap-8">
          <NavLink to="/" className="shrink-0 rounded-lg flex items-center h-11">
            <Logo />
          </NavLink>
          <nav aria-label="Main" className="hidden md:block flex-1 overflow-x-auto">
            <ul className="flex gap-1">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    className={({ isActive }) =>
                      `inline-flex items-center min-h-11 px-4 rounded-full text-[0.9375rem] font-semibold whitespace-nowrap transition-colors duration-[var(--dur-fast)] ${isActive ? "bg-subtle text-ink" : "text-ink-2 hover:text-ink hover:bg-subtle"}`
                    }
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="flex items-center gap-0.5 ml-auto md:ml-0 shrink-0">
            {!kiosk && <JudgeTour />}
            <Notifications />
            <button type="button" className="btn-ghost" onClick={signOut} aria-label={`Sign out ${name}`}>
              <LogOut size={18} aria-hidden="true" />
              <span className="hidden lg:inline">{name.replace(/^(Dr|Prof)\.\s*/, "").split(" ")[0]}</span>
            </button>
            {role !== "security" && (
              <span className="ml-1.5">
                <SosButton context={sos} compact />
              </span>
            )}
          </div>
        </div>
        {kiosk && <p className="text-center text-sm bg-yellow-tint text-yellow-ink py-1">Kiosk session: signs out after 2 minutes idle.</p>}
      </header>
      <main id="main" tabIndex={-1} className="max-w-6xl mx-auto px-4 pt-6 md:pt-10 pb-32 md:pb-24 outline-none">
        <Outlet />
      </main>
      {/* Phones: a thumb-reachable tab bar, like a native app. */}
      <nav aria-label="Main" className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-line pb-[env(safe-area-inset-bottom)]">
        <ul className="flex">
          {links.map((l) => (
            <li key={l.to} className="flex-1">
              <NavLink to={l.to} className={({ isActive }) => `flex flex-col items-center justify-center gap-1 min-h-16 text-xs font-semibold ${isActive ? "text-ink" : "text-ink-2"}`}>
                {({ isActive }) => (
                  <>
                    <span className={`grid place-items-center w-12 h-7 rounded-full transition-colors duration-[var(--dur-fast)] ${isActive ? "bg-yellow" : ""}`}>
                      <l.icon size={20} aria-hidden="true" />
                    </span>
                    {l.short}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

interface Note {
  id: string;
  text: string;
  kind: string;
  at: string;
  read: boolean;
  link?: string | null;
}

function Notifications() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api<{ items: Note[] }>("/notifications"), refetchInterval: 15_000 });
  const items = data?.items ?? [];
  const unread = items.filter((n) => !n.read);
  const markRead = async () => {
    if (!unread.length) return;
    await post("/notifications/read", { ids: unread.map((n) => n.id) });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };
  return (
    <Popover.Root onOpenChange={(o) => !o && void markRead()}>
      <Popover.Trigger className="btn-ghost relative" aria-label={`Notifications, ${unread.length} unread`}>
        <Bell size={18} aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute top-1 right-1 min-w-5 h-5 px-1 rounded-full bg-red-ink text-white text-xs grid place-items-center" aria-hidden="true">
            {unread.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" collisionPadding={16} className="z-40">
          <Popover.Popup
            className="card !p-2 w-[min(360px,calc(100vw-32px))] max-h-[60vh] overflow-auto origin-[var(--transform-origin)] transition-all duration-[var(--dur-base)] ease-[var(--ease-enter)] data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 data-[ending-style]:duration-[var(--dur-fast)]"
            style={{ boxShadow: "var(--shadow-float)" }}
          >
            <Popover.Title className="font-semibold px-3 py-2">Notifications</Popover.Title>
            {items.length === 0 ? (
              <p className="meta px-3 pb-3">You're all caught up.</p>
            ) : (
              <ul className="grid">
                {items.map((n) => (
                  <li key={n.id}>
                    <Link to={n.link ?? "#"} className={`block px-3 py-2.5 rounded-xl hover:bg-subtle ${n.read ? "text-ink-2" : ""}`}>
                      <span className={`chip tone-${n.kind === "alert" ? "red" : n.kind === "warning" ? "orange" : n.kind === "success" ? "green" : "neutral"} !p-0 !bg-transparent mr-1`}>
                        <span className="dot" aria-hidden="true" />
                      </span>
                      <span className="text-sm">{n.text}</span>
                      <span className="block meta text-xs mt-0.5">{new Date(n.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
