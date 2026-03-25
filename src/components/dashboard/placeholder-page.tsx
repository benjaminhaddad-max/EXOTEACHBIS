import { Header } from "@/components/header";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description?: string;
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div>
      <Header title={title} />
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white p-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Construction className="h-8 w-8 text-gray-400" />
        </div>
        <p className="mt-4 text-lg font-semibold text-gray-900">En construction</p>
        <p className="mt-2 max-w-md text-sm text-gray-500">
          {description || `La section ${title} sera disponible prochainement.`}
        </p>
      </div>
    </div>
  );
}
