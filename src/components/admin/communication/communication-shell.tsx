"use client";

import { useState } from "react";
import { Megaphone, FileText } from "lucide-react";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, Groupe, Matiere, Profile } from "@/types/database";
import { FormulairesSidebar, type SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { FormulairesShellContent } from "./formulaires-content";
import { AnnoncesTab } from "./annonces-tab";

type ActiveTab = "annonces" | "formulaires";

export function CommunicationShell({
  currentProfile,
  // Annonces
  initialAnnonces,
  annoncesGroupes,
  annoncesDossiers,
  annoncesMatieres,
  // Formulaires
  initialTemplates,
  initialFields,
  initialFormDossiers,
  initialGroupes,
  initialStudents,
  initialResponses,
}: {
  currentProfile: Profile;
  initialAnnonces: any[];
  annoncesGroupes: Groupe[];
  annoncesDossiers: Dossier[];
  annoncesMatieres: Matiere[];
  initialTemplates: FormTemplate[];
  initialFields: FormField[];
  initialFormDossiers: Dossier[];
  initialGroupes: Groupe[];
  initialStudents: Profile[];
  initialResponses: CoachingIntakeForm[];
}) {
  const [tab, setTab] = useState<ActiveTab>("annonces");
  const [sidebarFilter, setSidebarFilter] = useState<SidebarFilter>({ type: "all" });

  const isAdmin = ["admin", "superadmin"].includes(currentProfile.role);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Shared sidebar */}
      <FormulairesSidebar
        dossiers={initialFormDossiers.length > 0 ? initialFormDossiers : annoncesDossiers.filter(d => ["offer", "university"].includes(d.dossier_type))}
        groupes={initialGroupes.length > 0 ? initialGroupes : annoncesGroupes}
        templates={initialTemplates}
        filter={sidebarFilter}
        selectedTemplateId={null}
        onFilterChange={f => setSidebarFilter(f)}
        onSelectTemplate={() => { setTab("formulaires"); }}
        onCreateTemplate={() => { setTab("formulaires"); }}
      />

      {/* Right content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-5 py-3 border-b border-white/10 shrink-0">
          <button
            onClick={() => setTab("annonces")}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors rounded-lg"
            style={{
              backgroundColor: tab === "annonces" ? "rgba(201,168,76,0.15)" : "transparent",
              color: tab === "annonces" ? "#E3C286" : "rgba(255,255,255,0.4)",
              border: tab === "annonces" ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
            }}
          >
            <Megaphone size={13} /> Annonces
            <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
              {initialAnnonces.length}
            </span>
          </button>

          {isAdmin && (
            <button
              onClick={() => setTab("formulaires")}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors rounded-lg"
              style={{
                backgroundColor: tab === "formulaires" ? "rgba(201,168,76,0.15)" : "transparent",
                color: tab === "formulaires" ? "#E3C286" : "rgba(255,255,255,0.4)",
                border: tab === "formulaires" ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
              }}
            >
              <FileText size={13} /> Formulaires
              <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
                {initialTemplates.length}
              </span>
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-auto">
          {tab === "annonces" && (
            <AnnoncesTab
              initialAnnonces={initialAnnonces}
              groupes={annoncesGroupes}
              dossiers={annoncesDossiers}
              matieres={annoncesMatieres}
              currentProfile={currentProfile}
              sidebarFilter={sidebarFilter}
            />
          )}

          {tab === "formulaires" && isAdmin && (
            <FormulairesShellContent
              currentProfile={currentProfile}
              initialTemplates={initialTemplates}
              initialFields={initialFields}
              initialDossiers={initialFormDossiers}
              initialGroupes={initialGroupes}
              initialStudents={initialStudents}
              initialResponses={initialResponses}
              sidebarFilter={sidebarFilter}
            />
          )}
        </div>
      </div>
    </div>
  );
}
