import { Header } from "@/components/header";
import { ExercicesShell } from "@/components/eleve/exercices-shell";
import { getExercicesData } from "./actions";

export const dynamic = "force-dynamic";

export default async function ExercicesPage() {
  const { tree, allCours } = await getExercicesData();

  return (
    <div>
      <Header title="Exercices" />
      <ExercicesShell tree={tree} allCours={allCours} />
    </div>
  );
}
