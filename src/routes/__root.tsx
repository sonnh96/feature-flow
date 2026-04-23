import { Outlet, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
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
      { name: "description", content: "Feature Flow manages software feature documentation hierarchically." },
      { property: "og:description", content: "Feature Flow manages software feature documentation hierarchically." },
      { name: "twitter:description", content: "Feature Flow manages software feature documentation hierarchically." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/9f0af791-96da-4b06-afbb-ad1b298d21e7/id-preview-89d52cb1--f4421008-23f9-44b9-ad30-c1098b2893b6.lovable.app-1776916467176.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: () => (
    <div className="grid min-h-screen place-items-center px-4 text-center">
      <div>
        <h1 className="text-6xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found.</p>
        <a href="/" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
          Go home
        </a>
      </div>
    </div>
  ),
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const isAuthPage = path === "/auth";

  return (
    <ThemeProvider>
      <AuthProvider>
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
