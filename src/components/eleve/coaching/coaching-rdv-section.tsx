"use client";

import { useState, useTransition } from "react";
import { Calendar, Phone, Video, MapPin, Loader2, Check, Clock, AlertCircle } from "lucide-react";
import type { CoachingRdvRequest, CoachingRdvType, Profile } from "@/types/database";
import { createCoachingRdvRequest } from "@/app/(eleve)/coaching/actions";

interface CoachingRdvSectionProps {
  existingRequests: CoachingRdvRequest[];
  coaches: Profile[];
}

const RDV_TYPES: { value: CoachingRdvType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: "physique", label: "En présentiel", icon: <MapPin size={16} />, description: "Rendez-vous physique dans nos locaux" },
  { value: "appel", label: "Appel téléphonique", icon: <Phone size={16} />, description: "Un coach vous appelle" },
  { value: "visio", label: "Visio-conférence", icon: <Video size={16} />, description: "Via Zoom ou Google Meet" },
];

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  pending: { label: "En attente", color: "text-yellow-300", bg: "bg-yellow-500/15 border-yellow-500/30", icon: <Clock size={12} /> },
  assigned: { label: "Confirmé", color: "text-green-300", bg: "bg-green-500/15 border-green-500/30", icon: <Check size={12} /> },
  completed: { label: "Effectué", color: "text-blue-300", bg: "bg-blue-500/15 border-blue-500/30", icon: <Check size={12} /> },
  cancelled: { label: "Annulé", color: "text-red-300", bg: "bg-red-500/15 border-red-500/30", icon: <AlertCircle size={12} /> },
};

export function CoachingRdvSection({ existingRequests, coaches }: CoachingRdvSectionProps) {
  const [selectedType, setSelectedType] = useState<CoachingRdvType>("visio");
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);
  const [localRequests, setLocalRequests] = useState(existingRequests);

  const activeRequest = localRequests.find((r) => r.status === "pending" || r.status === "assigned");

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSubmit = () => {
    startTransition(async () => {
      const res = await createCoachingRdvRequest({ rdv_type: selectedType, message: message.trim() || null });
      if ("error" in res) {
        showToast(res.error!, "error");
        return;
      }
      showToast("Demande de RDV envoyée !", "success");
      setMessage("");
      // Add to local list
      if (res.data) {
        setLocalRequests((prev) => [res.data as CoachingRdvRequest, ...prev]);
      }
    });
  };

  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {/* Active request */}
      {activeRequest && (
        <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} style={{ color: "#C9A84C" }} />
            <span className="text-sm font-semibold text-white">Ta demande de RDV</span>
            {(() => {
              const sc = STATUS_CONFIG[activeRequest.status];
              return (
                <span className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sc.bg} ${sc.color}`}>
                  {sc.icon} {sc.label}
                </span>
              );
            })()}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span style={{ color: "rgba(255,255,255,0.4)" }}>Type :</span>
              <span className="ml-1 text-white">{RDV_TYPES.find((t) => t.value === activeRequest.rdv_type)?.label}</span>
            </div>
            {activeRequest.assigned_coach_id && (
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Coach :</span>
                <span className="ml-1 text-white">
                  {(() => {
                    const coach = coachMap.get(activeRequest.assigned_coach_id);
                    return coach ? `${coach.first_name ?? ""} ${coach.last_name ?? ""}`.trim() : "Assigné";
                  })()}
                </span>
              </div>
            )}
            {activeRequest.scheduled_at && (
              <div>
                <span style={{ color: "rgba(255,255,255,0.4)" }}>Date :</span>
                <span className="ml-1 text-white">
                  {new Date(activeRequest.scheduled_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>

          {activeRequest.message && (
            <p className="mt-2 text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
              {activeRequest.message}
            </p>
          )}
        </div>
      )}

      {/* Request form — only show if no active request */}
      {!activeRequest && (
        <div className="rounded-xl p-5 space-y-5" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">Demander un rendez-vous</h3>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Choisis le type de rendez-vous souhaité. Un coach te sera attribué dans les plus brefs délais.
            </p>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {RDV_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className="flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center"
                style={{
                  backgroundColor: selectedType === type.value ? "rgba(201,168,76,0.12)" : "rgba(255,255,255,0.03)",
                  borderColor: selectedType === type.value ? "rgba(201,168,76,0.4)" : "rgba(255,255,255,0.08)",
                  color: selectedType === type.value ? "#E3C286" : "rgba(255,255,255,0.5)",
                }}
              >
                {type.icon}
                <span className="text-xs font-semibold">{type.label}</span>
                <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{type.description}</span>
              </button>
            ))}
          </div>

          {/* Message */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.5)" }}>
              Message (optionnel)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Précise ta demande si besoin..."
              className="w-full rounded-lg px-3 py-2 text-sm text-white focus:outline-none resize-none"
              style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors"
            style={{ backgroundColor: "#C9A84C", color: "#0e1e35" }}
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Envoyer ma demande
          </button>
        </div>
      )}

      {/* History */}
      {localRequests.filter((r) => r.status === "completed" || r.status === "cancelled").length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            Historique
          </h4>
          <div className="space-y-2">
            {localRequests
              .filter((r) => r.status === "completed" || r.status === "cancelled")
              .map((r) => {
                const sc = STATUS_CONFIG[r.status];
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                    <span className={`flex items-center gap-1 ${sc.color}`}>{sc.icon} {sc.label}</span>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>
                      {RDV_TYPES.find((t) => t.value === r.rdv_type)?.label}
                    </span>
                    <span className="ml-auto" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {new Date(r.created_at).toLocaleDateString("fr-FR")}
                    </span>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}
