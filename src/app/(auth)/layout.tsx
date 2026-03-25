export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-navy-dark p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <img
            src="/logo-ds.svg"
            alt="Diploma Santé"
            className="h-20 w-auto object-contain"
          />
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-2xl ring-1 ring-black/5">
          {children}
        </div>
      </div>
    </div>
  );
}
