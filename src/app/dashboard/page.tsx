export const dynamic = "force-dynamic";
export const revalidate = false;

import DashboardClient from "./DashboardClient";

export default function Page() {
  return <DashboardClient />;
}
