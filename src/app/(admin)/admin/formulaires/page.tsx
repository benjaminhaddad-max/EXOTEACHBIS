import { redirect } from "next/navigation";

export default function FormulairesPage() {
  redirect("/admin/communication?tab=formulaires");
}
