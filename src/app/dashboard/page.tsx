// export const dynamic = "force-dynamic";
// export const revalidate = false;

// import DashboardClient from "./DashboardClient";
// import DashboardLiteClient from "./DashboardLiteClient";

// export default function Page() {
//   return (
//     <>
//       {/* Desktop / Tablet */}
//       <div className="hidden md:block">
//         <DashboardClient />
//       </div>

//       {/* Mobile */}
//       <div className="block md:hidden">
//         <DashboardLiteClient />
//       </div>
//     </>
//   );
// }
import DashboardClient from "@/components/dashboard/DashboardClient";
import DashboardLiteClient from "@/components/dashboard/DashboardLiteClient";

export default function DashboardPage() {
  return (
    <>
      {/* Desktop/Tablet */}
      <div className="hidden md:block">
        <DashboardClient />
      </div>

      {/* Mobile */}
      <div className="block md:hidden">
        <DashboardLiteClient />
      </div>
    </>
  );
}
