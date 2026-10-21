import { AdminRoute } from "@/admin/AdminRoute";
import { ADMIN_SLUGS } from "@/admin/resources";

export const dynamicParams = false;

export function generateStaticParams() {
  return ADMIN_SLUGS.map((resource) => ({ resource }));
}

export default async function Page({ params }: { params: Promise<{ resource: string }> }) {
  const { resource } = await params;
  return <AdminRoute slug={resource} />;
}
