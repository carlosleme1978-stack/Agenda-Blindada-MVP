"use client";

export const dynamic = "force-dynamic";
export const revalidate = false;

import { useEffect, useState } from "react";
import DashboardClient from "./DashboardClient";
import DashboardLiteClient from "./DashboardLiteClient";

const MD_BREAKPOINT = 768; // px (equivalente ao md)

export default function Page() {
  const [isMobile, setIsMobile] = useState<boolean | null>(null);

  useEffect(() => {
    const compute = () => setIsMobile(window.innerWidth < MD_BREAKPOINT);
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Evita mismatch de hidratação / “piscar”
  if (isMobile === null) return null;

  return isMobile ? <DashboardLiteClient /> : <DashboardClient />;
}
