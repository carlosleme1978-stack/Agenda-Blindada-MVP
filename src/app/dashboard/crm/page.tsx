import { Suspense } from "react";
import CRMClient from "./CRMClient";

export default function Page() {
  return (
    <Suspense fallback={<div style={{ padding: 14, opacity: 0.7 }}>Carregando CRM…</div>}>
      <CRMClient />
    </Suspense>
  );
}