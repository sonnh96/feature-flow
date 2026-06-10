import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

// Layout route for a single project. It only renders child routes via <Outlet/>:
//   - index route  → project overview (projects.$projectId.index.tsx)
//   - features/$id → feature detail (projects.$projectId.features.$featureId.tsx)
export const Route = createFileRoute("/projects/$projectId")({
  beforeLoad: async () => {
    const token = localStorage.getItem("access_token");
    if (!token) throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
