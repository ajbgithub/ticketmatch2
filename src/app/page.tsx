"use client";
import dynamic from "next/dynamic";

const TicketMarket = dynamic(
  () => import("./components/TicketMarket"),
  { ssr: false }
);

export default function Page() {
  return <TicketMarket />;
}
