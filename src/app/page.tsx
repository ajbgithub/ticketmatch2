"use client";
import dynamic from "next/dynamic";

const WTPInteractiveDiagram = dynamic(
  () => import("./components/WTPInteractiveDiagram"),
  { ssr: false }
);

export default function Page() {
  return <WTPInteractiveDiagram />;
}
