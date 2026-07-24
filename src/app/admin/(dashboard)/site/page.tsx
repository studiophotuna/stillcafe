import { getSiteContent } from "@/lib/data";
import { SiteContentEditor } from "@/components/admin/SiteContentEditor";

export const dynamic = "force-dynamic";

export default async function SitePage() {
  const content = await getSiteContent();

  return (
    <div className="max-w-4xl">
      <h1 className="font-serif text-2xl text-espresso">
        Site content
      </h1>
      <p className="mt-1 text-sm text-espresso/50">
        Customize the landing page and the booking flow separately using the
        tabs below.
      </p>
      <div className="mt-6">
        <SiteContentEditor content={content} />
      </div>
    </div>
  );
}
