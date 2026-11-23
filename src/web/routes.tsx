/** Routes. Feature pages are code-split; 3D loads only when a 3D view first opens. */
import { lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, useRouteError } from "react-router-dom";
import type { Role } from "@shared/domain";
import { Layout } from "./components/Layout";
import { Loading } from "./components/ui";
import { useSession } from "./lib/auth";

const SignIn = lazy(() => import("./features/auth/SignIn"));
const LandingPage = lazy(() => import("./features/auth/Landing"));
const ProjectsHome = lazy(() => import("./features/projects/ProjectsHome"));
const NewProject = lazy(() => import("./features/projects/NewProject"));
const ProjectPage = lazy(() => import("./features/projects/ProjectPage"));
const Discover = lazy(() => import("./features/discovery/Discover"));
const EquipmentPage = lazy(() => import("./features/discovery/EquipmentPage"));
const LabMap = lazy(() => import("./features/discovery/LabMap"));
const Approvals = lazy(() => import("./features/approvals/Approvals"));
const DecisionPage = lazy(() => import("./features/decisions/DecisionPage"));
const Session = lazy(() => import("./features/safety/Session"));
const SafetySettings = lazy(() => import("./features/safety/SafetySettings"));
const Incidents = lazy(() => import("./features/safety/Incidents"));
const TechHome = lazy(() => import("./features/technician/TechHome"));
const AdminHome = lazy(() => import("./features/admin/AdminHome"));
const Explainer = lazy(() => import("./features/discovery/ExplainerPage"));

export function homeFor(role: Role): string {
  return { student: "/projects", faculty: "/approvals", technician: "/tech", admin: "/admin", security: "/incidents" }[role];
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>;
}

function Guard({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready) return <Loading label="Checking your session" />;
  if (!user) return <Navigate to="/demo" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Page>{children}</Page>;
}

/** Public pages: signed-in users go straight to their home. */
function Public({ children }: { children: ReactNode }) {
  const { user, ready } = useSession();
  if (!ready) return null;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  return <Page>{children}</Page>;
}

function RouteError() {
  const err = useRouteError() as { status?: number } | undefined;
  return (
    <main id="main" className="max-w-xl mx-auto px-4 py-24 text-center">
      <h1>{err?.status === 404 ? "That page doesn't exist" : "Something went wrong"}</h1>
      <p className="meta mt-3">Let's get you back on track.</p>
      <a className="btn btn-primary mt-6" href="/">
        Go home
      </a>
    </main>
  );
}

const S: Role[] = ["student"];
const STAFF: Role[] = ["faculty", "technician", "admin"];

export const router = createBrowserRouter([
  { path: "/", element: <Public><LandingPage /></Public>, errorElement: <RouteError /> },
  { path: "/demo", element: <Public><SignIn /></Public>, errorElement: <RouteError /> },
  {
    element: <Layout />,
    errorElement: <RouteError />,
    children: [
      { path: "/projects", element: <Guard roles={["student", "faculty", "admin"]}><ProjectsHome /></Guard> },
      { path: "/projects/new", element: <Guard roles={S}><NewProject /></Guard> },
      { path: "/projects/:id", element: <Guard><ProjectPage /></Guard> },
      { path: "/discover", element: <Guard><Discover /></Guard> },
      { path: "/equipment/:id", element: <Guard><EquipmentPage /></Guard> },
      { path: "/explainer/:id", element: <Guard><Explainer /></Guard> },
      { path: "/map", element: <Guard><LabMap /></Guard> },
      { path: "/approvals", element: <Guard roles={["faculty", "admin"]}><Approvals /></Guard> },
      { path: "/decisions/:id", element: <Guard><DecisionPage /></Guard> },
      { path: "/session", element: <Guard roles={S}><Session /></Guard> },
      { path: "/safety", element: <Guard roles={S}><SafetySettings /></Guard> },
      { path: "/incidents", element: <Guard roles={[...STAFF, "security"]}><Incidents /></Guard> },
      { path: "/tech", element: <Guard roles={["technician"]}><TechHome /></Guard> },
      { path: "/admin", element: <Guard roles={["admin", "faculty"]}><AdminHome /></Guard> },
      { path: "*", element: <RouteError /> },
    ],
  },
]);
