export const dynamic = "force-dynamic";
export const revalidate = false;

import InsightsClient from "./InsightsClient";

export default function Page() {
  return <InsightsClient />;
}
