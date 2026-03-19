import MarketplaceRiaProfilePageClient from "./page.client";

export default function MarketplaceRiaProfilePage() {
  return <MarketplaceRiaProfilePageClient />;
}

export function generateStaticParams() {
  // Static export requires at least one param for dynamic segments.
  return [{ riaId: "placeholder-ria" }];
}
