"use client";

import { useState, useMemo, useEffect } from "react";
import { BookOpen, MessageCircleQuestion, Pencil, GraduationCap, Plus, X, ChevronDown, Users } from "lucide-react";
import type { Profile, Dossier } from "@/types/database";
import { createClient } from "@/lib/supabase/client";

import type { Groupe } from "@/types/database";

type ProfMatiere = {
  id: string;
  prof_id: string;
  matiere_id: string;
  role_type: "cours" | "qa" | "contenu" | "all";
  dossier_id: string | null;
  groupe_id: string | null;
};

interface PedagogicalTeamSectionProps {
  universityId: string;
  dossiers: Dossier[];
  users: Profile[];
  groupes: Groupe[];
  profMatieres: ProfMatiere[];
  onUpdate: () => void;
}

const ROLE_CONFIG = {
  cours: { label: "Cours en classe", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-50" },
  qa: { label: "Q&A (réponses)", icon: MessageCircleQuestion, color: "text-amber-600", bg: "bg-amber-50" },
  contenu: { label: "Contenu péda.", icon: Pencil, color: "text-emerald-600", bg: "bg-emerald-50" },
};

export function PedagogicalTeamSection({
  universityId, dossiers, users, groupes, profMatieres, onUpdate,
}: PedagogicalTeamSectionProps) {
  const supabase = createClient();

  // Find semesters and their subject children, grouped
  const semestersWithMatieres = useMemo(() => {
    const semesters = dossiers
      .filter(d => d.parent_id === universityId)
      .sort((a, b) => a.order_index - b.order_index);
    return semesters
      .map(sem => ({
        semester: sem,
        matieres: dossiers
          .filter(d => d.parent_id === sem.id && d.dossier_type === "subject")
          .sort((a, b) => a.order_index - b.order_index),
      }))
      .filter(g => g.matieres.length > 0);
  }, [dossiers, universityId]);

  // Flat list for compatibility
  const matieres = useMemo(() => semestersWithMatieres.flatMap(g => g.matieres), [semestersWithMatieres]);

  // Get all profs
  const profs = useMemo(() => users.filter(u => u.role === "prof" || u.role === "admin" || u.role === "superadmin" || u.role === "coach"), [users]);

  // Get classes linked to this university
  const uniClasses = useMemo(() => groupes.filter(g => g.formation_dossier_id === universityId), [groupes, universityId]);

  // Index prof_matieres by matière
  const pmByMatiere = useMemo(() => {
    const map = new Map<string, ProfMatiere[]>();
    for (const pm of profMatieres) {
      if (!map.has(pm.matiere_id)) map.set(pm.matiere_id, []);
      map.get(pm.matiere_id)!.push(pm);
    }
    return map;
  }, [profMatieres]);

  const [addingFor, setAddingFor] = useState<{ matiereId: string; roleType: string } | null>(null);
  const [addProfId, setAddProfId] = useState("");
  const [addGroupeId, setAddGroupeId] = useState("");

  const handleAssign = async (profId: string, matiereId: string, roleType: string, groupeId?: string) => {
    await supabase.from("prof_matieres").insert({
      prof_id: profId,
      matiere_id: matiereId,
      role_type: roleType,
      dossier_id: universityId,
      groupe_id: groupeId || null,
    });
    setAddingFor(null);
    setAddProfId("");
    setAddGroupeId("");
    onUpdate();
  };

  const handleRemove = async (pmId: string) => {
    await supabase.from("prof_matieres").delete().eq("id", pmId);
    onUpdate();
  };

  if (matieres.length === 0) {
    return (
      <div className="mt-6 pt-4 border-t border-gray-200">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Équipe pédagogique</h3>
        <p className="text-xs text-gray-400">Ajoutez des matières dans Pédagogie & Exercices pour gérer l&apos;équipe.</p>
      </div>
    );
  }

  return (
    <div className="mt-6 pt-4 border-t border-gray-200">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Équipe pédagogique</h3>

      <div className="space-y-5">
        {semestersWithMatieres.map(({ semester, matieres: semMatieres }) => (
          <div key={semester.id}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">{semester.name}</p>
            <div className="space-y-2">
              {semMatieres.map(mat => {
                const assignments = pmByMatiere.get(mat.id) || [];
                return (
                  <details key={mat.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden group/mat">
                    <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors list-none [&::-webkit-details-marker]:hidden">
                      <ChevronDown size={12} className="text-gray-400 transition-transform group-open/mat:-rotate-180 shrink-0" />
                      <BookOpen size={14} className="text-emerald-500 shrink-0" />
                      <span className="text-sm font-medium text-gray-800 flex-1">{mat.name}</span>
                      <span className="text-[10px] text-gray-400">{assignments.length} prof{assignments.length !== 1 ? "s" : ""}</span>
                    </summary>

                    <div className="border-t border-gray-100 px-4 py-3 space-y-3">
                {(["cours", "qa", "contenu"] as const).map(roleType => {
                  const config = ROLE_CONFIG[roleType];
                  const Icon = config.icon;
                  const assigned = assignments.filter(a => a.role_type === roleType || a.role_type === "all");
                  const isAdding = addingFor?.matiereId === mat.id && addingFor.roleType === roleType;

                  return (
                    <div key={roleType}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`p-1 rounded ${config.bg}`}>
                          <Icon size={12} className={config.color} />
                        </span>
                        <span className="text-xs font-medium text-gray-600">{config.label}</span>
                      </div>

                      <div className="ml-7 space-y-1">
                        {assigned.length === 0 && !isAdding && (
                          <span className="text-[11px] text-gray-400">— Non assigné</span>
                        )}
                        {assigned.map(a => {
                          const prof = users.find(u => u.id === a.prof_id);
                          const classe = a.groupe_id ? groupes.find(g => g.id === a.groupe_id) : null;
                          return (
                            <div key={a.id} className="flex items-center gap-2 group/prof">
                              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-[8px] font-bold text-gray-500">
                                {(prof?.first_name?.[0] || "").toUpperCase()}{(prof?.last_name?.[0] || "").toUpperCase()}
                              </div>
                              <span className="text-xs text-gray-700">
                                {prof?.first_name} {prof?.last_name}
                                {classe && <span className="text-gray-400"> · {classe.name}</span>}
                              </span>
                              <button
                                onClick={() => handleRemove(a.id)}
                                className="ml-auto opacity-0 group-hover/prof:opacity-100 p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                              >
                                <X size={10} />
                              </button>
                            </div>
                          );
                        })}

                        {isAdding ? (
                          <div className="space-y-1.5 bg-gray-50 rounded-lg p-2">
                            <select
                              autoFocus
                              value={addProfId}
                              onChange={(e) => setAddProfId(e.target.value)}
                              className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold/50 bg-white"
                            >
                              <option value="">Choisir un professeur...</option>
                              {profs.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.first_name} {p.last_name}
                                </option>
                              ))}
                            </select>
                            {roleType === "cours" && (
                              <select
                                value={addGroupeId}
                                onChange={(e) => setAddGroupeId(e.target.value)}
                                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold/50 bg-white"
                              >
                                <option value="">Choisir la classe *</option>
                                {uniClasses.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )}
                            <div className="flex gap-1.5">
                              <button
                                onClick={() => { setAddingFor(null); setAddProfId(""); setAddGroupeId(""); }}
                                className="text-[10px] px-2 py-1 rounded text-gray-500 hover:bg-gray-200"
                              >
                                Annuler
                              </button>
                              <button
                                onClick={() => {
                                  if (addProfId) handleAssign(addProfId, mat.id, roleType, addGroupeId || undefined);
                                }}
                                disabled={!addProfId || (roleType === "cours" && !addGroupeId)}
                                className="text-[10px] px-3 py-1 rounded bg-navy text-white font-medium disabled:opacity-40"
                              >
                                Valider
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setAddingFor({ matiereId: mat.id, roleType }); setAddProfId(""); setAddGroupeId(""); }}
                            className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 mt-0.5"
                          >
                            <Plus size={10} /> Assigner
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
                    </div>
                  </details>
                );
              })}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

// ─── Coaching Assignments ────────────────────────────────────────────────────

function CoachingAssignments({ universityId, users, groupes }: { universityId: string; users: Profile[]; groupes: Groupe[] }) {
  const supabase = createClient();
  const uniClasses = useMemo(() => groupes.filter(g => g.formation_dossier_id === universityId), [groupes, universityId]);
  const coaches = useMemo(() => users.filter(u => u.role === "coach"), [users]);

  const [assignments, setAssignments] = useState<{ coach_id: string; groupe_id: string }[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [addCoachId, setAddCoachId] = useState("");

  useEffect(() => {
    if (uniClasses.length === 0) return;
    supabase
      .from("coach_groupe_assignments")
      .select("coach_id, groupe_id")
      .in("groupe_id", uniClasses.map(c => c.id))
      .then(({ data }) => {
        setAssignments(data ?? []);
        setLoaded(true);
      });
  }, [uniClasses]);

  const handleAssign = async (coachId: string, groupeId: string) => {
    await supabase.from("coach_groupe_assignments").upsert({ coach_id: coachId, groupe_id: groupeId }, { onConflict: "coach_id,groupe_id" });
    setAssignments(prev => [...prev, { coach_id: coachId, groupe_id: groupeId }]);
    setAddingFor(null);
    setAddCoachId("");
  };

  const handleRemove = async (coachId: string, groupeId: string) => {
    await supabase.from("coach_groupe_assignments").delete().eq("coach_id", coachId).eq("groupe_id", groupeId);
    setAssignments(prev => prev.filter(a => !(a.coach_id === coachId && a.groupe_id === groupeId)));
  };

  if (uniClasses.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-1">Coaching</p>
      <div className="space-y-2">
        {uniClasses.map(classe => {
          const classCoaches = assignments.filter(a => a.groupe_id === classe.id);
          const isAdding = addingFor === classe.id;

          return (
            <div key={classe.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: classe.color }} />
                <span className="text-sm font-medium text-gray-800 flex-1">{classe.name}</span>
                <span className="text-[10px] text-gray-400">{classCoaches.length} coach{classCoaches.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="ml-5 space-y-1">
                {classCoaches.length === 0 && !isAdding && (
                  <span className="text-[11px] text-gray-400">— Aucun coach assigné</span>
                )}
                {classCoaches.map(a => {
                  const coach = users.find(u => u.id === a.coach_id);
                  return (
                    <div key={a.coach_id} className="flex items-center gap-2 group/coach">
                      <div className="w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center text-[8px] font-bold text-amber-600">
                        {(coach?.first_name?.[0] || "").toUpperCase()}{(coach?.last_name?.[0] || "").toUpperCase()}
                      </div>
                      <span className="text-xs text-gray-700">{coach?.first_name} {coach?.last_name}</span>
                      <button
                        onClick={() => handleRemove(a.coach_id, a.groupe_id)}
                        className="ml-auto opacity-0 group-hover/coach:opacity-100 p-0.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  );
                })}

                {isAdding ? (
                  <div className="space-y-1.5 bg-gray-50 rounded-lg p-2">
                    <select
                      autoFocus
                      value={addCoachId}
                      onChange={(e) => setAddCoachId(e.target.value)}
                      className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-gold/50 bg-white"
                    >
                      <option value="">Choisir un coach...</option>
                      {coaches
                        .filter(c => !classCoaches.some(a => a.coach_id === c.id))
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                        ))}
                    </select>
                    <div className="flex gap-1.5">
                      <button onClick={() => { setAddingFor(null); setAddCoachId(""); }}
                        className="text-[10px] px-2 py-1 rounded text-gray-500 hover:bg-gray-200">
                        Annuler
                      </button>
                      <button
                        onClick={() => { if (addCoachId) handleAssign(addCoachId, classe.id); }}
                        disabled={!addCoachId}
                        className="text-[10px] px-3 py-1 rounded bg-navy text-white font-medium disabled:opacity-40">
                        Valider
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingFor(classe.id); setAddCoachId(""); }}
                    className="flex items-center gap-1 text-[10px] text-blue-600 hover:text-blue-800 mt-0.5"
                  >
                    <Plus size={10} /> Assigner un coach
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
