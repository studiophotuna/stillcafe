import { getAllPackages } from "@/lib/data";
import { PackagesManager } from "@/components/admin/PackagesManager";

export const dynamic = "force-dynamic";

export default async function AdminPackagesPage() {
  const packages = await getAllPackages();
  return <PackagesManager packages={packages} />;
}
