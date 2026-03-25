import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div>
      <h2 className="mb-6 text-center text-xl font-bold text-gray-900">
        Connexion
      </h2>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
