"use client";

import { UploadTasks } from "@/components/UploadTasks";
import { PageHead } from "@/components/ui";
import { useWorkload } from "@/lib/workload/store";

/** Upload tasks, for members an admin has given upload access (Intake › Who can upload tasks). */
export default function UploadPage() {
  const { data, canUpload } = useWorkload();
  if (!canUpload) return null;
  return (
    <>
      <PageHead title={`Upload tasks · ${data.org.team.name}`} sub="Add many tasks at once from an Excel file. They join the queue like any other task." />
      <UploadTasks heading={false} />
    </>
  );
}
