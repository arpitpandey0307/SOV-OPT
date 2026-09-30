import type { Metadata } from "next";
import { RunsView } from "@/components/views/runs";

export const metadata: Metadata = { title: "Runs" };

export default function Page() {
  return <RunsView />;
}
