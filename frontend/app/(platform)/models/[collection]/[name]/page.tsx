import type { Metadata } from "next";
import { Suspense } from "react";
import { ModelStudioView } from "@/components/views/model-studio";
import { Skeleton } from "@/components/ui";

export async function generateMetadata(props: PageProps<"/models/[collection]/[name]">): Promise<Metadata> {
  const { name } = await props.params;
  return { title: decodeURIComponent(name) };
}

export default async function Page(props: PageProps<"/models/[collection]/[name]">) {
  const { collection, name } = await props.params;
  return (
    <Suspense fallback={<Skeleton className="mx-auto h-96 max-w-6xl" />}>
      <ModelStudioView collection={decodeURIComponent(collection)} name={decodeURIComponent(name)} />
    </Suspense>
  );
}
