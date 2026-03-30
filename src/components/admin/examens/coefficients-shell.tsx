"use client";

import { useState, useTransition } from "react";
import { ArrowLeft, Check, Loader2, AlertCircle, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import {
  upsertMatiereCoefficient,
  createFiliere,
  deleteFiliere,
} from "@/app/(admin)/admin/examens/actions";

type Filiere = { id: string; name: string; code: string; color: string; order_index: number };
type Matiere = { id: string; name: string; dossier_id: string };
type Coeff = { id: string; matiere_id: string; filiere_id: string; coefficient: number };

type Toast = { message: string; kind: "success" | "error" } | null;

export function CoefficientsShell({
  filieres: initFilieres,
  matieres,
  coefficients: initCoeffs,
}: {
  filieres: Filiere[];
  matieres: Matiere[];
  coefficients: Coeff[];
}) {
  const [filieres, setFilieres] = useState(initFilieres);
  const [coeffs, setCoeffs] = useState(initCoeffs);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [showAddFiliere, setShowAddFiliere] = useState(false);
  const [newFiliere, setNewFiliere] = useState({ name: "", code: "", color: "#3B82F6" });

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const getCoeff = (matiereId: string, filiereId: string): number => {
    const c = coeffs.find((c) => c.matiere_id === matiereId && c.filiere_id === filiereId);
    return c?.coefficient ?? 1;
  };

  const handleCoeffChange = (matiereId: string, filiereId: string, value: number) => {
    setCoeffs((prev) => {
      const idx = prev.findIndex((c) => c.matiere_id === matiereId && c.filiere_id === filiereId);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx] = { ...updated[idx], coefficient: value };
        return updated;
      }
      return [...prev, { id: crypto.randomUUID(), matiere_id: matiereId, filiere_id: filiereId, coefficient: value }];
    });
  };

  const saveCoeff = (matiereId: string, filiereId: string, value: number) => {
    startTransition(async () => {
      const res = await upsertMatiereCoefficient(matiereId, filiereId, value);
      if (res.error) showToast(res.error, "error");
    });
  };

  const handleAddFiliere = () => {
    if (!newFiliere.name.trim() || !newFiliere.code.trim()) return;
    startTransition(async () => {
      const res = await createFiliere(newFiliere);
      if (res.error) { showToast(res.error, "error"); return; }
      setShowAddFiliere(false);
      setNewFiliere({ name: "", code: "", color: "#3B82F6" });
      showToast("Filière ajoutée", "success");
      window.location.reload();
    });
  };

  const handleDeleteFiliere = (id: string) => {
    if (!confirm("Supprimer cette filière ?")) return;
    startTransition(async () => {
      const res = await deleteFiliere(id);
      if (res.error) { showToast(res.error, "error"); return; }
      setFilieres((prev) => prev.filter((f) => f.id !== id));
      showToast("Filière supprimée", "success");
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
          toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"
        }`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/10">
        <Link href="/admin/examens" className="text-white/50 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-white">Coefficients par filière</h1>
          <p className="text-xs text-white/50 mt-0.5">
            Configurez le poids de chaque matière par filière (Médecine, Dentaire, Pharmacie, etc.)
          </p>
        </div>
        <button
          onClick={() => setShowAddFiliere(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg hover:bg-[#A8892E] transition-colors"
        >
          <Plus size={14} /> Filière
        </button>
      </div>

      {/* Add filiere modal */}
      {showAddFiliere && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowAddFiliere(false)}>
          <div className="bg-[#0e1e35] border border-white/15 rounded-2xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-white">Nouvelle filière</h3>
              <button onClick={() => setShowAddFiliere(false)} className="text-white/40 hover:text-white"><X size={18} /></button>
            </div>
            <div>
              <label className="text-xs text-white/50 mb-1 block">Nom</label>
              <input value={newFiliere.name} onChange={(e) => setNewFiliere({ ...newFiliere, name: e.target.value })} placeholder="Médecine" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/50 mb-1 block">Code</label>
                <input value={newFiliere.code} onChange={(e) => setNewFiliere({ ...newFiliere, code: e.target.value.toUpperCase() })} placeholder="MED" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/30" />
              </div>
              <div>
                <label className="text-xs text-white/50 mb-1 block">Couleur</label>
                <input type="color" value={newFiliere.color} onChange={(e) => setNewFiliere({ ...newFiliere, color: e.target.value })} className="w-full h-10 bg-transparent cursor-pointer" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={() => setShowAddFiliere(false)} className="px-4 py-2 text-sm text-white/60">Annuler</button>
              <button onClick={handleAddFiliere} disabled={isPending || !newFiliere.name.trim() || !newFiliere.code.trim()} className="flex items-center gap-2 px-4 py-2 bg-[#C9A84C] text-[#0e1e35] text-sm font-semibold rounded-lg disabled:opacity-50">
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Créer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filières pills */}
      <div className="px-6 py-3 border-b border-white/5 flex flex-wrap gap-2">
        {filieres.map((f) => (
          <div key={f.id} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: f.color + "30", borderColor: f.color, borderWidth: 1 }}>
            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.color }} />
            {f.name} ({f.code})
            <button onClick={() => handleDeleteFiliere(f.id)} className="ml-1 opacity-50 hover:opacity-100 transition-opacity"><Trash2 size={10} /></button>
          </div>
        ))}
      </div>

      {/* Coefficients table */}
      <div className="flex-1 overflow-auto p-6">
        {matieres.length === 0 ? (
          <p className="text-center text-white/30 py-12">Aucune matière trouvée</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-3 text-white/50 text-xs font-medium uppercase tracking-wider w-[300px]">Matière</th>
                  {filieres.map((f) => (
                    <th key={f.id} className="py-3 px-3 text-center text-xs font-medium uppercase tracking-wider" style={{ color: f.color }}>
                      {f.code}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {matieres.map((m) => (
                  <tr key={m.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-2 px-3 text-white/80 text-xs">{m.name}</td>
                    {filieres.map((f) => {
                      const val = getCoeff(m.id, f.id);
                      return (
                        <td key={f.id} className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={0}
                            max={10}
                            step={0.5}
                            value={val}
                            onChange={(e) => handleCoeffChange(m.id, f.id, Number(e.target.value) || 1)}
                            onBlur={(e) => saveCoeff(m.id, f.id, Number(e.target.value) || 1)}
                            className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-xs text-center text-white focus:outline-none focus:border-white/30"
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
