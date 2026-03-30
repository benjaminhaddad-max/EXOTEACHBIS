import { AdminSidebar } from "@/components/sidebar/admin-sidebar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="relative z-0 flex-1 overflow-auto bg-[#F5F6FA] p-6 pt-16 lg:p-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
