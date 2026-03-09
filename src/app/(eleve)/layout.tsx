import { StudentSidebar } from "@/components/sidebar/student-sidebar";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      <StudentSidebar />
      <main className="flex-1 overflow-auto bg-gray-50 p-6 pt-16 lg:p-8 lg:pt-8">
        {children}
      </main>
    </div>
  );
}
