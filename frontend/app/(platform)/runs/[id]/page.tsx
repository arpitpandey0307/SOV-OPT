import type { Metadata } from "next";
import { Suspense } from "react";
import { RunCenterView } from "@/components/views/run-center";
import { Skeleton } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/runs/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: `Run ${id.replace("run_", "")}` };
}

export default async function Page(props: PageProps<"/runs/[id]">) {
  const { id } = await props.params;
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <RunCenterView key={id} runId={decodeURIComponent(id)} />
    </Suspense>
  );
}
