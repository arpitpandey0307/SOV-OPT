import type { Metadata } from "next";
import { SystemView } from "@/components/views/system";

export const metadata: Metadata = { title: "GPU observatory" };

export default function Page() {
  return <SystemView />;
}
