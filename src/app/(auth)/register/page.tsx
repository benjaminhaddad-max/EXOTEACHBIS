import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div>
      <h2 className="mb-6 text-center text-xl font-bold text-gray-900">
        Inscription
      </h2>
      <RegisterForm />
    </div>
  );
}
