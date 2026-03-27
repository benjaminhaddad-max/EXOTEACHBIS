"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { ChevronDown, GraduationCap, Building2, Layers, Check } from "lucide-react";
import type { Dossier, Groupe } from "@/types/database";

export type FormationTreeVariant = "dark" | "light";

export interface FormationClassesTreeSidebarProps {
  dossiers: Dossier[];
  groupes: Groupe[];
  selectedGroupeIds: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onSetSelection: Dispatch<SetStateAction<Set<string>>>;
  variant?: FormationTreeVariant;
  /** Libellé du bouton « tout voir » (aucun filtre de classe) */
  allItemsLabel?: string;
  title?: string;
  className?: string;
}

/**
 * Arborescence formations → universités → classes (cases à cocher).
 * Même logique que l’onglet Communication : sélection vide = pas de filtre par classe.
 */
export function FormationClassesTreeSidebar({
  dossiers,
  groupes,
  selectedGroupeIds,
  onToggle,
  onSelectAll,
  onSetSelection,
  variant = "dark",
  allItemsLabel,
  title = "Formations & Classes",
  className = "",
}: FormationClassesTreeSidebarProps) {
  const isLight = variant === "light";
  const allLabel = allItemsLabel ?? (isLight ? "Toutes les questions" : "Toutes les communications");

  const offers = useMemo(() => dossiers.filter(d => d.dossier_type === "offer").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const universities = useMemo(() => dossiers.filter(d => d.dossier_type === "university").sort((a, b) => a.order_index - b.order_index), [dossiers]);
  const unisByOffer = useMemo(() => {
    const m = new Map<string, Dossier[]>();
    for (const u of universities)
      if (u.parent_id) {
        if (!m.has(u.parent_id)) m.set(u.parent_id, []);
        m.get(u.parent_id)!.push(u);
      }
    return m;
  }, [universities]);
  const groupsByUni = useMemo(() => {
    const m = new Map<string, Groupe[]>();
    for (const g of groupes)
      if (g.formation_dossier_id) {
        if (!m.has(g.formation_dossier_id)) m.set(g.formation_dossier_id, []);
        m.get(g.formation_dossier_id)!.push(g);
      }
    return m;
  }, [groupes]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(offers.map(o => o.id)));
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const getUniGroupIds = (uniId: string) => (groupsByUni.get(uniId) ?? []).map(g => g.id);
  const getOfferGroupIds = (offerId: string) => {
    const ids: string[] = [];
    for (const u of unisByOffer.get(offerId) ?? []) ids.push(...getUniGroupIds(u.id));
    return ids;
  };

  const toggleGroupIdBlock = (ids: string[]) => {
    if (ids.length === 0) return;
    onSetSelection(prev => {
      const next = new Set(prev);
      const allOn = ids.every(id => next.has(id));
      if (allOn) for (const id of ids) next.delete(id);
      else for (const id of ids) next.add(id);
      return next;
    });
  };

  const gold = "#C9A84C";
  const violet = "#A78BFA";

  const Chk = ({ checked, partial }: { checked: boolean; partial?: boolean }) =>
    isLight ? (
      <div
        className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
          checked ? "bg-blue-600 border-blue-600" : partial ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
        }`}
      >
        {checked && <Check size={9} className="text-white" strokeWidth={3} />}
        {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm bg-blue-500" />}
      </div>
    ) : (
      <div
        className="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
        style={{
          borderColor: checked || partial ? gold : "rgba(255,255,255,0.2)",
          backgroundColor: checked ? gold : "transparent",
        }}
      >
        {checked && <Check size={9} style={{ color: "#0e1e35" }} strokeWidth={3} />}
        {!checked && partial && <div className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: gold }} />}
      </div>
    );

  const rootClass = isLight
    ? `flex flex-col shrink-0 border-r border-gray-200 overflow-y-auto h-full bg-gray-50/80 w-[248px] ${className}`
    : `flex flex-col shrink-0 border-r border-white/10 overflow-y-auto h-full w-[260px] ${className}`;

  const rootStyle = isLight ? undefined : { backgroundColor: "rgba(0,0,0,0.15)" };

  return (
    <div className={rootClass} style={rootStyle}>
      <div className="px-3 pt-3 pb-2 shrink-0">
        <p className={`text-[10px] font-semibold uppercase tracking-widest ${isLight ? "text-gray-500" : ""}`} style={isLight ? undefined : { color: "rgba(255,255,255,0.3)" }}>
          {title}
        </p>
      </div>

      <div className="px-2 pb-1">
        <button
          type="button"
          onClick={onSelectAll}
          className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            isLight
              ? selectedGroupeIds.size === 0
                ? "bg-blue-50 text-blue-800 border border-blue-200"
                : "text-gray-600 border border-transparent hover:bg-gray-100"
              : ""
          }`}
          style={
            isLight
              ? undefined
              : {
                  backgroundColor: selectedGroupeIds.size === 0 ? "rgba(201,168,76,0.15)" : "transparent",
                  color: selectedGroupeIds.size === 0 ? "#E3C286" : "rgba(255,255,255,0.5)",
                  border: selectedGroupeIds.size === 0 ? "1px solid rgba(201,168,76,0.25)" : "1px solid transparent",
                }
          }
        >
          <Layers size={12} className={isLight ? "text-blue-600" : undefined} />
          {allLabel}
        </button>
      </div>

      <div className="px-2 pb-2 space-y-0.5 flex-1">
        {offers.map(offer => {
          const offerUnis = unisByOffer.get(offer.id) ?? [];
          const offerIds = getOfferGroupIds(offer.id);
          const allChecked = offerIds.length > 0 && offerIds.every(id => selectedGroupeIds.has(id));
          const someChecked = offerIds.some(id => selectedGroupeIds.has(id));
          const isOpen = expanded.has(offer.id);

          return (
            <div key={offer.id}>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => toggleGroupIdBlock(offerIds)} className="p-1 shrink-0">
                  <Chk checked={allChecked} partial={!allChecked && someChecked} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleExpand(offer.id)}
                  className={`flex-1 flex items-center gap-1.5 px-1 py-1.5 rounded-lg transition-all text-left ${
                    isLight ? "hover:bg-gray-100" : ""
                  }`}
                  onMouseOver={e => {
                    if (!isLight) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
                  }}
                  onMouseOut={e => {
                    if (!isLight) e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <GraduationCap size={11} className={isLight ? "text-amber-700" : ""} style={isLight ? undefined : { color: gold }} />
                  <span className={`flex-1 text-[11px] font-bold truncate ${isLight ? "text-amber-800" : ""}`} style={isLight ? undefined : { color: gold }}>
                    {offer.name}
                  </span>
                  <ChevronDown
                    size={10}
                    className={isLight ? "text-gray-400" : ""}
                    style={{
                      transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                      transition: "transform 0.2s",
                      ...(isLight ? {} : { color: "rgba(255,255,255,0.2)" }),
                    }}
                  />
                </button>
              </div>

              {isOpen &&
                offerUnis.map(uni => {
                  const uniGroups = groupsByUni.get(uni.id) ?? [];
                  const uniIds = getUniGroupIds(uni.id);
                  const uAll = uniIds.length > 0 && uniIds.every(id => selectedGroupeIds.has(id));
                  const uSome = uniIds.some(id => selectedGroupeIds.has(id));
                  const isUniOpen = expanded.has(uni.id);

                  return (
                    <div key={uni.id} className="ml-2">
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => toggleGroupIdBlock(uniIds)} className="p-1 shrink-0">
                          <Chk checked={uAll} partial={!uAll && uSome} />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleExpand(uni.id)}
                          className={`flex-1 flex items-center gap-1 pl-1 pr-2 py-1 rounded-lg text-left transition-all ${isLight ? "hover:bg-gray-100" : ""}`}
                          onMouseOver={e => {
                            if (!isLight) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)";
                          }}
                          onMouseOut={e => {
                            if (!isLight) e.currentTarget.style.backgroundColor = "transparent";
                          }}
                        >
                          <Building2 size={9} className={isLight ? "text-violet-700" : ""} style={isLight ? undefined : { color: violet }} />
                          <span className={`flex-1 text-[10px] font-semibold truncate ${isLight ? "text-violet-900" : ""}`} style={isLight ? undefined : { color: violet }}>
                            {uni.name}
                          </span>
                          {uniGroups.length > 0 && (
                            <ChevronDown
                              size={9}
                              className={isLight ? "text-gray-400" : ""}
                              style={{
                                transform: isUniOpen ? "rotate(0deg)" : "rotate(-90deg)",
                                transition: "transform 0.2s",
                                ...(isLight ? {} : { color: "rgba(255,255,255,0.15)" }),
                              }}
                            />
                          )}
                        </button>
                      </div>

                      {isUniOpen &&
                        uniGroups.map(g => {
                          const isChecked = selectedGroupeIds.has(g.id);
                          return (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => onToggle(g.id)}
                              className={`w-full flex items-center gap-2 pl-5 pr-2 py-1 rounded-lg transition-all text-left ${
                                isLight ? (isChecked ? "bg-blue-50/80" : "hover:bg-gray-100") : ""
                              }`}
                              style={
                                isLight
                                  ? undefined
                                  : {
                                      backgroundColor: isChecked ? "rgba(201,168,76,0.08)" : "transparent",
                                    }
                              }
                              onMouseOver={e => {
                                if (isLight) {
                                  if (!isChecked) e.currentTarget.style.backgroundColor = "#f3f4f6";
                                  else e.currentTarget.style.backgroundColor = "rgba(219,234,254,0.9)";
                                } else {
                                  e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.1)" : "rgba(255,255,255,0.04)";
                                }
                              }}
                              onMouseOut={e => {
                                if (isLight) {
                                  e.currentTarget.style.backgroundColor = isChecked ? "rgba(239,246,255,0.9)" : "transparent";
                                } else {
                                  e.currentTarget.style.backgroundColor = isChecked ? "rgba(201,168,76,0.08)" : "transparent";
                                }
                              }}
                            >
                              <Chk checked={isChecked} />
                              <span className="w-3 h-3 rounded flex items-center justify-center text-[7px] font-bold text-white shrink-0" style={{ backgroundColor: g.color }}>
                                {g.name[0]?.toUpperCase()}
                              </span>
                              <span
                                className={`text-[10px] font-medium truncate ${isLight ? (isChecked ? "text-blue-900" : "text-gray-700") : ""}`}
                                style={isLight ? undefined : { color: isChecked ? "#E3C286" : "rgba(255,255,255,0.6)" }}
                              >
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

      <div className="h-3 shrink-0" />
    </div>
  );
}
