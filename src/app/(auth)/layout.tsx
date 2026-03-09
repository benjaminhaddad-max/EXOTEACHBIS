export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-navy-dark p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gold text-navy font-bold text-xl">
            DS
          </div>
          <h1 className="text-2xl font-bold text-white">Diploma Santé</h1>
          <p className="mt-1 text-sm text-white/60">Plateforme E-Learning</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white p-8 shadow-xl">
          {children}
        </div>
      </div>
    </div>
  );
}
