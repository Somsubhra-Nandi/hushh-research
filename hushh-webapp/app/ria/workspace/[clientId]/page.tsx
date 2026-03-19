import WorkspacePageClient from "./page.client";

export default function RiaWorkspacePage() {
  return <WorkspacePageClient />;
}

export function generateStaticParams() {
  // Static export requires at least one param for dynamic segments.
  return [{ clientId: "placeholder-client" }];
}
