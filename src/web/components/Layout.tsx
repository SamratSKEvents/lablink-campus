/** App shell: skip link, role-aware navigation, notifications, SOS, judge tour. */
import { Popover } from "@base-ui/react/popover";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, LogOut } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { Role } from "@shared/domain";
import { api, post } from "../lib/api";
import { useSession } from "../lib/auth";
import { SosButton, useDefaultSosContext } from "./Sos";
import { JudgeTour } from "./JudgeTour";

const NAV: Record<Role, { to: string; label: string }[]> = {
  student: [
    { to: "/projects", label: "My projects" },
    { to: "/discover", label: "Discover" },
    { to: "/map", label: "Lab map" },
    { to: "/session", label: "Lab session" },
    { to: "/safety", label: "Safety" },
  ],
  faculty: [
    { to: "/approvals", label: "Approvals" },
    { to: "/projects", label: "Students' projects" },
    { to: "/admin", label: "Fairness" },
    { to: "/incidents", label: "Incidents" },
  ],
  technician: [
    { to: "/tech", label: "Today" },
    { to: "/incidents", label: "Incidents" },
    { to: "/map", label: "Lab map" },
    { to: "/discover", label: "Equipment" },
  ],
  admin: [
    { to: "/admin", label: "Overview" },
    { to: "/projects", label: "Projects" },
    { to: "/map", label: "Lab map" },
    { to: "/incidents", label: "Incidents" },
  ],
  security: [{ to: "/incidents", label: "Incidents" }],
};

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 font-display text-xl" aria-label="LabLink">
      <svg width="28" height="28" viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="var(--yellow)" />
        <path d="M22 16h8v26h14v8H22z" fill="var(--ink-900)" />
        <circle cx="46" cy="20" r="6" fill="var(--green)" />
      </svg>
      LabLink
    </span>
  );
}

export function Layout() {
  const { user, kiosk, signOut } = useSession();
  const sos = useDefaultSosContext();
  if (!user) return null;
  const links = kiosk ? [{ to: "/session", label: "Lab session" }] : NAV[user.role];
  return (
    <div className="min-h-dvh">
      <a href="#main" className="skip-link btn btn-primary">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-line">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-4">
          <NavLink to="/" className="shrink-0 rounded-lg">
            <Logo />
          </NavLink>
          <nav aria-label="Main" className="flex-1 overflow-x-auto">
            <ul className="flex gap-1">
              {links.map((l) => (
                <li key={l.to}>
                  <NavLink
                    to={l.to}
                    className={({ isActive }) =>
                      `inline-flex items-center min-h-11 px-3 rounded-full text-sm font-semibold whitespace-nowrap transition-colors duration-[var(--dur-fast)] ${isActive ? "bg-subtle text-ink" : "text-ink-2 hover:text-ink hover:bg-subtle"}`
                    }
                  >
                    {l.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <Notifications />
          {user.role !== "security" && <SosButton context={sos} compact />}
          <button type="button" className="btn btn-soft btn-sm !px-3" onClick={signOut} aria-label={`Sign out ${user.name}`}>
            <LogOut size={16} aria-hidden="true" />
            <span className="hidden md:inline">{user.name.split(" ")[0]}</span>
          </button>
        </div>
        {kiosk && <p className="text-center text-sm bg-yellow-tint text-yellow-ink py-1">Kiosk session: signs out after 2 minutes idle.</p>}
      </header>
      <main id="main" tabIndex={-1} className="max-w-6xl mx-auto px-4 py-10 outline-none">
        <Outlet />
      </main>
      {!kiosk && <JudgeTour />}
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
      <Popover.Trigger className="btn btn-soft btn-sm !px-3 relative" aria-label={`Notifications, ${unread.length} unread`}>
        <Bell size={16} aria-hidden="true" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-ink text-white text-xs grid place-items-center" aria-hidden="true">
            {unread.length}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="end" className="z-40">
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
