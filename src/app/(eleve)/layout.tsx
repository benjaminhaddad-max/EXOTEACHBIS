import { StudentSidebar } from "@/components/sidebar/student-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";
import { NotificationBell } from "@/components/eleve/notification-bell";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <ImpersonationBanner />
      <div className="flex min-h-screen">
        <StudentSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top bar with notification bell */}
          <div className="sticky top-0 z-30 flex items-center justify-end gap-3 px-6 py-2.5 bg-[#F5F6FA]/80 backdrop-blur-md border-b border-gray-200/60 lg:px-8">
            <NotificationBell />
          </div>
          <main className="flex-1 overflow-auto bg-[#F5F6FA] p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
