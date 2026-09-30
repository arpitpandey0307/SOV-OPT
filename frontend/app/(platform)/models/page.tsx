import type { Metadata } from "next";
import { Suspense } from "react";
import { ModelsView } from "@/components/views/models";
import { Skeleton } from "@/components/ui";

export const metadata: Metadata = { title: "Models" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <ModelsView />
    </Suspense>
  );
}
