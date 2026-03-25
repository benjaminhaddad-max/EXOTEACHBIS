import { StudentSidebar } from "@/components/sidebar/student-sidebar";
import { ImpersonationBanner } from "@/components/impersonation-banner";

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
        <main className="flex-1 overflow-auto bg-[#F5F6FA] p-6 pt-16 lg:p-8 lg:pt-8">
          {children}
        </main>
      </div>
    </>
  );
}
