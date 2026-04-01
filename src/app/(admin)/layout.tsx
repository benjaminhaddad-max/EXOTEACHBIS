import { AdminSidebar } from "@/components/sidebar/admin-sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="relative z-0 flex-1 overflow-auto p-6 pt-16 lg:p-8 lg:pt-8" style={{ background: "linear-gradient(180deg, #0B1628 0%, #0F1D30 100%)" }}>
        {children}
      </main>
    </div>
  );
}
