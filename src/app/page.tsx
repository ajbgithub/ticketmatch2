"use client";

import dynamic from "next/dynamic";

// Import your main component dynamically so it only renders on the client.
// (This avoids server-side rendering issues with recharts.)
const WTPInteractiveDiagram = dynamic(
  () => import("../components/WTPInteractiveDiagram"),
  { ssr: false }
);

export default function Page() {
  return <WTPInteractiveDiagram />;
}
