import { Outlet, createRootRoute, HeadContent, useRouterState } from "@tanstack/react-router";
import appCss from "../styles.css?url";
import { ThemeProvider } from "@/lib/theme";
import { AuthProvider } from "@/lib/auth";
import { AppHeader } from "@/components/AppHeader";
import { GlobalSearch } from "@/components/GlobalSearch";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Featurebase — Feature Documentation Manager" },
      {
        name: "description",
        content:
          "Hierarchical feature documentation manager: organize projects, features, sub-features, relations and history.",
      },
      { property: "og:title", content: "Featurebase — Feature Documentation Manager" },
      { name: "twitter:title", content: "Featurebase — Feature Documentation Manager" },
      { property: "og:description", content: "Feature Flow manages software feature documentation hierarchically." },
      { name: "twitter:description", content: "Feature Flow manages software feature documentation hierarchically." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap",
      },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Page not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <a
          href="/"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-soft)] transition-all hover:opacity-90 active:scale-[0.97]"
        >
          Go home
        </a>
      </div>
    </div>
  ),
});

function RootComponent() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = path === "/auth";

  return (
    <ThemeProvider>
      <AuthProvider>
        <HeadContent />
        <div className="flex min-h-screen flex-col">
          {!isAuthPage && <AppHeader />}
          <main className="flex-1">
            <Outlet />
          </main>
          {!isAuthPage && <GlobalSearch />}
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}
