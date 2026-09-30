import type { Metadata } from "next";
import { BenchmarksView } from "@/components/views/benchmarks";

export const metadata: Metadata = { title: "Benchmarks" };

export default function Page() {
  return <BenchmarksView />;
}
