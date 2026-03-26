"use client";

import { useState, useMemo } from "react";
import {
  ChevronDown, GraduationCap, Building2, FileText, Plus, Check, Layers,
} from "lucide-react";
import type { Dossier, FormTemplate, Groupe } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SidebarFilter =
  | { type: "all" }
  | { type: "offer"; offerId: string }
  | { type: "university"; dossierId: string }
  | { type: "groupe"; groupeId: string };

interface FormulairesSidebarProps {
  dossiers: Dossier[];
  groupes: Groupe[];
  templates: FormTemplate[];
  filter: SidebarFilter;
  selectedTemplateId: string | null;
  onFilterChange: (f: SidebarFilter) => void;
  onSelectTemplate: (id: string) => void;
  onCreateTemplate: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function FormulairesSidebar({
  dossiers, groupes, templates, filter, selectedTemplateId,
  onFilterChange, onSelectTemplate, onCreateTemplate,
}: FormulairesSidebarProps) {
  const offers = useMemo(
    () => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index),
    [dossiers]
  );
  const universities = useMemo(
    () => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index),
    [dossiers]
  );
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
  const toggleExpand = (id: string) => setExpanded(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  // Count forms per target
  const formCountByTarget = useMemo(() => {
    const counts = { all: templates.length } as Record<string, number>;
    for (const t of templates) {
      if (t.target_type === "offer" && t.target_offer_code) counts[`offer:${t.target_offer_code}`] = (counts[`offer:${t.target_offer_code}`] || 0) + 1;
      if (t.target_type === "university" && t.target_university_dossier_id) counts[`uni:${t.target_university_dossier_id}`] = (counts[`uni:${t.target_university_dossier_id}`] || 0) + 1;
      if (t.target_type === "groupe" && t.target_groupe_id) counts[`grp:${t.target_groupe_id}`] = (counts[`grp:${t.target_groupe_id}`] || 0) + 1;
    }
    return counts;
  }, [templates]);

  // Recent templates (last 5)
  const recentTemplates = useMemo(() => templates.slice(0, 5), [templates]);

  const isFilterActive = (f: SidebarFilter) => {
    if (f.type === "all" && filter.type === "all") return true;
    if (f.type === "offer" && filter.type === "offer" && f.offerId === filter.offerId) return true;
    if (f.type === "university" && filter.type === "university" && f.dossierId === filter.dossierId) return true;
    if (f.type === "groupe" && filter.type === "groupe" && f.groupeId === filter.groupeId) return true;
    return false;
  };

  return (
    <div className="flex flex-col shrink-0 border-r border-white/10 overflow-y-auto h-full" style={{ width: 280, backgroundColor: "rgba(0,0,0,0.15)" }}>
      {/* Header */}
      <div className="px-4 pt-4 pb-2 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>
          Formations &amp; Classes
        </p>
      </div>

      {/* "All forms" */}
      <div className="px-3 pb-1">
        <button
          onClick={() => onFilterChange({ type: "all" })}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all"
          style={{
            backgroundColor: filter.type === "all" ? "rgba(201,168,76,0.15)" : "transparent",
            color: filter.type === "all" ? "#E3C286" : "rgba(255,255,255,0.5)",
            border: filter.type === "all" ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
          }}
        >
          <Layers size={12} />
          Tous les formulaires
          {templates.length > 0 && (
            <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(201,168,76,0.12)", color: "#C9A84C" }}>
              {templates.length}
            </span>
          )}
        </button>
      </div>

      {/* Offer → University → Groups tree */}
      <div className="px-3 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const isOpen = expanded.has(offer.id);
          return (
            <div key={offer.id}>
              <button
                onClick={() => { toggleExpand(offer.id); onFilterChange({ type: "offer", offerId: offer.id }); }}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg transition-all"
                style={{ backgroundColor: isFilterActive({ type: "offer", offerId: offer.id }) ? "rgba(201,168,76,0.08)" : "transparent" }}
                onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                onMouseOut={e => (e.currentTarget.style.backgroundColor = isFilterActive({ type: "offer", offerId: offer.id }) ? "rgba(201,168,76,0.08)" : "transparent")}
              >
                <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(201,168,76,0.18)" }}>
                  <GraduationCap size={11} style={{ color: "#C9A84C" }} />
                </div>
                <span className="flex-1 text-left text-[11px] font-bold truncate" style={{ color: "#C9A84C" }}>{offer.name}</span>
                <ChevronDown size={11} style={{ color: "rgba(255,255,255,0.3)", transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s", flexShrink: 0 }} />
              </button>

              {isOpen && offerUnis.map(uni => {
                const uniGroups = groupsByUni.get(uni.id) ?? [];
                const isUniOpen = expanded.has(uni.id);
                return (
                  <div key={uni.id} className="ml-1">
                    <button
                      onClick={() => { toggleExpand(uni.id); onFilterChange({ type: "university", dossierId: uni.id }); }}
                      className="w-full flex items-center gap-2 pl-4 pr-2 py-1.5 rounded-lg transition-all"
                      style={{ backgroundColor: isFilterActive({ type: "university", dossierId: uni.id }) ? "rgba(167,139,250,0.08)" : "transparent" }}
                      onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                      onMouseOut={e => (e.currentTarget.style.backgroundColor = isFilterActive({ type: "university", dossierId: uni.id }) ? "rgba(167,139,250,0.08)" : "transparent")}
                    >
                      <div className="w-4 h-4 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(167,139,250,0.18)" }}>
                        <Building2 size={9} style={{ color: "#A78BFA" }} />
                      </div>
                      <span className="flex-1 text-left text-[10px] font-semibold truncate" style={{ color: "#A78BFA" }}>{uni.name}</span>
                      {uniGroups.length > 0 && (
                        <ChevronDown size={10} style={{ color: "rgba(255,255,255,0.2)", transform: isUniOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.2s", flexShrink: 0 }} />
                      )}
                    </button>

                    {isUniOpen && uniGroups.map(g => {
                      const isGrpActive = isFilterActive({ type: "groupe", groupeId: g.id });
                      return (
                        <button
                          key={g.id}
                          onClick={() => onFilterChange({ type: "groupe", groupeId: g.id })}
                          className="w-full flex items-center gap-2 pl-8 pr-2 py-1 rounded-lg transition-all text-left"
                          style={{ backgroundColor: isGrpActive ? "rgba(201,168,76,0.08)" : "transparent" }}
                          onMouseOver={e => (e.currentTarget.style.backgroundColor = isGrpActive ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.04)")}
                          onMouseOut={e => (e.currentTarget.style.backgroundColor = isGrpActive ? "rgba(201,168,76,0.08)" : "transparent")}
                        >
                          <span className="w-3 h-3 rounded flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>
                            {g.name[0]?.toUpperCase()}
                          </span>
                          <span className="flex-1 text-[10px] font-medium truncate" style={{ color: isGrpActive ? "#E3C286" : "rgba(255,255,255,0.6)" }}>
                            {g.name}
                          </span>
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

      {/* Separator */}
      <div className="mx-3 border-t border-white/5" />

      {/* Create button */}
      <div className="px-3 py-3">
        <button
          onClick={onCreateTemplate}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors"
          style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
          onMouseOver={e => (e.currentTarget.style.backgroundColor = "#A8892E")}
          onMouseOut={e => (e.currentTarget.style.backgroundColor = "#C9A84C")}
        >
          <Plus size={13} />
          Créer un formulaire
        </button>
      </div>

      {/* Recent templates */}
      {recentTemplates.length > 0 && (
        <div className="px-3 pb-4">
          <p className="px-2 pb-1 text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>
            Récents
          </p>
          {recentTemplates.map(t => (
            <button
              key={t.id}
              onClick={() => onSelectTemplate(t.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-all"
              style={{ backgroundColor: selectedTemplateId === t.id ? "rgba(201,168,76,0.1)" : "transparent" }}
              onMouseOver={e => (e.currentTarget.style.backgroundColor = selectedTemplateId === t.id ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.04)")}
              onMouseOut={e => (e.currentTarget.style.backgroundColor = selectedTemplateId === t.id ? "rgba(201,168,76,0.1)" : "transparent")}
            >
              <FileText size={10} style={{ color: "rgba(255,255,255,0.3)" }} />
              <span className="flex-1 text-[10px] truncate font-medium" style={{ color: selectedTemplateId === t.id ? "#E3C286" : "rgba(255,255,255,0.55)" }}>
                {t.title}
              </span>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: t.is_active ? "#34D399" : "rgba(255,255,255,0.15)" }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
