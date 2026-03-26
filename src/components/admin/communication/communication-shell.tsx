"use client";

import { useState, useMemo } from "react";
import {
  Megaphone, FileText, ChevronDown, GraduationCap, Building2,
  Layers, Check, Plus, Users,
} from "lucide-react";
import type { CoachingIntakeForm, Dossier, FormField, FormTemplate, Groupe, Matiere, Profile } from "@/types/database";
import type { SidebarFilter } from "@/components/admin/formulaires/formulaires-sidebar";
import { FormulairesShellContent } from "./formulaires-content";
import { AnnoncesTab } from "./annonces-tab";

type ActiveTab = "annonces" | "formulaires";

export function CommunicationShell({
  currentProfile,
  initialAnnonces, annoncesGroupes, annoncesDossiers, annoncesMatieres,
  initialTemplates, initialFields, initialFormDossiers, initialGroupes, initialStudents, initialResponses,
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
  const [selectedGroupeIds, setSelectedGroupeIds] = useState<Set<string>>(new Set());
  const [createAnnonce, setCreateAnnonce] = useState(false);
  const [createForm, setCreateForm] = useState(false);
  const isAdmin = ["admin", "superadmin"].includes(currentProfile.role);

  const dossiers = initialFormDossiers.length > 0 ? initialFormDossiers : annoncesDossiers.filter(d => ["offer", "university"].includes(d.dossier_type));
  const groupes = initialGroupes.length > 0 ? initialGroupes : annoncesGroupes;

  const toggleGroupe = (id: string) => setSelectedGroupeIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const selectAll = () => setSelectedGroupeIds(new Set());

  // Build sidebar filter from selected groupes (for formulaires compatibility)
  const sidebarFilter: SidebarFilter = useMemo(() => {
    if (selectedGroupeIds.size === 0) return { type: "all" };
    if (selectedGroupeIds.size === 1) {
      const id = [...selectedGroupeIds][0];
      return { type: "groupe", groupeId: id };
    }
    return { type: "all" }; // multi-select: pass filter via selectedGroupeIds directly
  }, [selectedGroupeIds]);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Sidebar with checkboxes */}
      <CommSidebar
        dossiers={dossiers}
        groupes={groupes}
        selectedGroupeIds={selectedGroupeIds}
        onToggle={toggleGroupe}
        onSelectAll={selectAll}
      />

      {/* Right content */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
        {/* Tab bar + action button */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => { setTab("annonces"); setCreateAnnonce(false); }}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors rounded-lg"
              style={{ backgroundColor: tab === "annonces" ? "rgba(201,168,76,0.15)" : "transparent", color: tab === "annonces" ? "#E3C286" : "rgba(255,255,255,0.4)", border: tab === "annonces" ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent" }}>
              <Megaphone size={13} /> Annonces
              <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>{initialAnnonces.length}</span>
            </button>
            {isAdmin && (
              <button onClick={() => { setTab("formulaires"); setCreateForm(false); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors rounded-lg"
                style={{ backgroundColor: tab === "formulaires" ? "rgba(201,168,76,0.15)" : "transparent", color: tab === "formulaires" ? "#E3C286" : "rgba(255,255,255,0.4)", border: tab === "formulaires" ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent" }}>
                <FileText size={13} /> Formulaires
                <span className="text-[10px] ml-1 px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>{initialTemplates.length}</span>
              </button>
            )}
          </div>

          {selectedGroupeIds.size > 0 && (
            <span className="text-[10px] px-2 py-1 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
              {selectedGroupeIds.size} classe{selectedGroupeIds.size > 1 ? "s" : ""}
            </span>
          )}

          <div className="ml-auto flex items-center gap-2">
            {tab === "annonces" && selectedGroupeIds.size === 0 && (
              <span className="text-[10px] italic" style={{ color: "rgba(255,255,255,0.3)" }}>← Sélectionne d&apos;abord les destinataires</span>
            )}
            {tab === "annonces" && (
              <button onClick={() => { if (selectedGroupeIds.size > 0) setCreateAnnonce(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  backgroundColor: selectedGroupeIds.size > 0 ? "#C9A84C" : "rgba(255,255,255,0.06)",
                  color: selectedGroupeIds.size > 0 ? "#0e1e35" : "rgba(255,255,255,0.25)",
                  cursor: selectedGroupeIds.size > 0 ? "pointer" : "not-allowed",
                }}>
                <Plus size={13} /> Nouvelle annonce
              </button>
            )}
            {tab === "formulaires" && isAdmin && (
              <button onClick={() => setCreateForm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}>
                <Plus size={13} /> Nouveau formulaire
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {tab === "annonces" && (
            <AnnoncesTab
              initialAnnonces={initialAnnonces}
              groupes={annoncesGroupes}
              dossiers={annoncesDossiers}
              matieres={annoncesMatieres}
              currentProfile={currentProfile}
              sidebarFilter={sidebarFilter}
              selectedGroupeIds={selectedGroupeIds}
              triggerCreate={createAnnonce}
              onCreateHandled={() => setCreateAnnonce(false)}
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
              triggerCreate={createForm}
              onCreateHandled={() => setCreateForm(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Communication Sidebar with Checkboxes ────────────────────────────────────

function CommSidebar({ dossiers, groupes, selectedGroupeIds, onToggle, onSelectAll }: {
  dossiers: Dossier[]; groupes: Groupe[];
  selectedGroupeIds: Set<string>; onToggle: (id: string) => void; onSelectAll: () => void;
}) {
  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const m = new Map<string, Dossier[]>();
    for (const u of universities) if (u.parent_id) { if (!m.has(u.parent_id)) m.set(u.parent_id, []); m.get(u.parent_id)!.push(u); }
    return m;
  }, [universities]);
  const groupsByUni = useMemo(() => {
    const m = new Map<string, Groupe[]>();
    for (const g of groupes) if (g.formation_dossier_id) { if (!m.has(g.formation_dossier_id)) m.set(g.formation_dossier_id, []); m.get(g.formation_dossier_id)!.push(g); }
    return m;
  }, [groupes]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(offers.map(o => o.id)));
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Get all group IDs under offer/university
  const getUniGroupIds = (uniId: string) => (groupsByUni.get(uniId) ?? []).map(g => g.id);
  const getOfferGroupIds = (offerId: string) => { const ids: string[] = []; for (const u of (unisByOffer.get(offerId) ?? [])) ids.push(...getUniGroupIds(u.id)); return ids; };

  const toggleIds = (ids: string[]) => {
    const next = new Set(selectedGroupeIds);
    const allChecked = ids.every(id => next.has(id));
    if (allChecked) for (const id of ids) next.delete(id);
    else for (const id of ids) next.add(id);
    // Use onToggle indirectly by calling selectAll then adding
    // Actually just rebuild set
    onSelectAll(); // clear
    setTimeout(() => { for (const id of (allChecked ? [] : ids)) onToggle(id); }, 0);
  };

  const Chk = ({ checked, partial }: { checked: boolean; partial?: boolean }) => (
    <div className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0" style={{
      borderColor: checked || partial ? "#C9A84C" : "rgba(255,255,255,0.2)",
      backgroundColor: checked ? "#C9A84C" : "transparent",
    }}>
      {checked && <Check size={9} style={{ color: "#0e1e35" }} strokeWidth={3} />}
      {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: "#C9A84C" }} />}
    </div>
  );

  return (
    <div className="flex flex-col shrink-0 border-r border-white/10 overflow-y-auto h-full" style={{ width: 260, backgroundColor: "rgba(0,0,0,0.15)" }}>
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Formations &amp; Classes
        </p>
      </div>

      {/* All */}
      <div className="px-3 pb-1">
        <button onClick={onSelectAll}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{ backgroundColor: selectedGroupeIds.size === 0 ? "rgba(201,168,76,0.15)" : "transparent", color: selectedGroupeIds.size === 0 ? "#E3C286" : "rgba(255,255,255,0.5)", border: selectedGroupeIds.size === 0 ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent" }}>
          <Layers size={12} />
          Toutes les communications
        </button>
      </div>

      {/* Tree with checkboxes */}
      <div className="px-3 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const offerIds = getOfferGroupIds(offer.id);
          const allChecked = offerIds.length > 0 && offerIds.every(id => selectedGroupeIds.has(id));
          const someChecked = offerIds.some(id => selectedGroupeIds.has(id));
          const isOpen = expanded.has(offer.id);

          return (
            <div key={offer.id}>
              <div className="flex items-center gap-1">
                <button onClick={() => { const next = new Set(selectedGroupeIds); if (allChecked) for (const id of offerIds) next.delete(id); else for (const id of offerIds) next.add(id); onSelectAll(); setTimeout(() => { for (const id of (allChecked ? [] : [...next])) onToggle(id); }, 0); }}
                  className="p-1 shrink-0"><Chk checked={allChecked} partial={!allChecked && someChecked} /></button>
                <button onClick={() => toggleExpand(offer.id)} className="flex-1 flex items-center gap-1.5 px-1 py-1.5 rounded-lg transition-all text-left"
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                  <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                  <span className="flex-1 text-[11px] font-bold truncate" style={{ color: "#C9A84C" }}>{offer.name}</span>
                  <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.2)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />
                </button>
              </div>

              {isOpen && offerUnis.map(uni => {
                const uniGroups = groupsByUni.get(uni.id) ?? [];
                const uniIds = getUniGroupIds(uni.id);
                const uAll = uniIds.length > 0 && uniIds.every(id => selectedGroupeIds.has(id));
                const uSome = uniIds.some(id => selectedGroupeIds.has(id));
                const isUniOpen = expanded.has(uni.id);

                return (
                  <div key={uni.id} className="ml-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => { const next = new Set(selectedGroupeIds); if (uAll) for (const id of uniIds) next.delete(id); else for (const id of uniIds) next.add(id); onSelectAll(); setTimeout(() => { for (const id of [...next]) onToggle(id); }, 0); }}
                        className="p-1 shrink-0"><Chk checked={uAll} partial={!uAll && uSome} /></button>
                      <button onClick={() => toggleExpand(uni.id)} className="flex-1 flex items-center gap-1 pl-1 pr-2 py-1 rounded-lg text-left transition-all"
                        onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")} onMouseOut={e => (e.currentTarget.style.backgroundColor = "transparent")}>
                        <Building2 size={9} style={{ color: "#A78BFA" }} />
                        <span className="flex-1 text-[10px] font-semibold truncate" style={{ color: "#A78BFA" }}>{uni.name}</span>
                        {uniGroups.length > 0 && <ChevronDown size={9} style={{ color: "rgba(255,255,255,0.15)", transform: isUniOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s" }} />}
                      </button>
                    </div>

                    {isUniOpen && uniGroups.map(g => {
                      const isChecked = selectedGroupeIds.has(g.id);
                      return (
                        <button key={g.id} onClick={() => onToggle(g.id)}
                          className="w-full flex items-center gap-2 pl-6 pr-2 py-1 rounded-lg transition-all text-left"
                          style={{ backgroundColor: isChecked ? "rgba(201,168,76,0.08)" : "transparent" }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.04)")}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.08)" : "transparent")}>
                          <Chk checked={isChecked} />
                          <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>{g.name[0]?.toUpperCase()}</span>
                          <span className="text-[10px] font-medium truncate" style={{ color: isChecked ? "#E3C286" : "rgba(255,255,255,0.6)" }}>{g.name}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Spacer */}
      <div className="h-4" />
    </div>
  );
}
