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

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: "En attente", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock size={12} /> },
  assigned: { label: "Confirmé", color: "bg-green-100 text-green-700 border-green-200", icon: <Check size={12} /> },
  completed: { label: "Effectué", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <Check size={12} /> },
  cancelled: { label: "Annulé", color: "bg-red-100 text-red-700 border-red-200", icon: <AlertCircle size={12} /> },
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
      if ("error" in res) { showToast(res.error!, "error"); return; }
      showToast("Demande de RDV envoyée !", "success");
      setMessage("");
      if (res.data) setLocalRequests((prev) => [res.data as CoachingRdvRequest, ...prev]);
    });
  };

  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  return (
    <div className="space-y-6">
      {/* Active request */}
      {activeRequest && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-amber-600" />
            <span className="text-sm font-semibold text-gray-900">Ta demande de RDV</span>
            {(() => {
              const sc = STATUS_CONFIG[activeRequest.status];
              return (
                <span className={`ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${sc.color}`}>
                  {sc.icon} {sc.label}
                </span>
              );
            })()}
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-gray-400">Type :</span>
              <span className="ml-1 text-gray-700">{RDV_TYPES.find((t) => t.value === activeRequest.rdv_type)?.label}</span>
            </div>
            {activeRequest.assigned_coach_id && (
              <div>
                <span className="text-gray-400">Coach :</span>
                <span className="ml-1 text-gray-700">
                  {(() => {
                    const coach = coachMap.get(activeRequest.assigned_coach_id);
                    return coach ? `${coach.first_name ?? ""} ${coach.last_name ?? ""}`.trim() : "Assigné";
                  })()}
                </span>
              </div>
            )}
            {activeRequest.scheduled_at && (
              <div>
                <span className="text-gray-400">Date :</span>
                <span className="ml-1 text-gray-700">
                  {new Date(activeRequest.scheduled_at).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            )}
          </div>
          {activeRequest.message && (
            <p className="mt-2 text-xs text-gray-500">{activeRequest.message}</p>
          )}
        </div>
      )}

      {/* Request form */}
      {!activeRequest && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Demander un rendez-vous</h3>
            <p className="text-xs text-gray-500">
              Choisis le type de rendez-vous souhaité. Un coach te sera attribué dans les plus brefs délais.
            </p>
          </div>

          {/* Type selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {RDV_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border transition-all text-center ${
                  selectedType === type.value
                    ? "border-amber-300 bg-amber-50 text-amber-700"
                    : "border-gray-200 bg-gray-50 text-gray-500 hover:border-gray-300"
                }`}
              >
                {type.icon}
                <span className="text-xs font-semibold">{type.label}</span>
                <span className="text-[10px] text-gray-400">{type.description}</span>
              </button>
            ))}
          </div>

          {/* Message */}
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Message (optionnel)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="Précise ta demande si besoin..."
              className="w-full rounded-lg px-3 py-2 text-sm text-gray-900 border border-gray-200 focus:outline-none focus:border-amber-300 resize-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-colors bg-[#0e1e35] text-white hover:bg-[#152a45]"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Calendar size={14} />}
            Envoyer ma demande
          </button>
        </div>
      )}

      {/* History */}
      {localRequests.filter((r) => r.status === "completed" || r.status === "cancelled").length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-400 mb-3">Historique</h4>
          <div className="space-y-2">
            {localRequests
              .filter((r) => r.status === "completed" || r.status === "cancelled")
              .map((r) => {
                const sc = STATUS_CONFIG[r.status];
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-gray-200 text-xs">
                    <span className={`flex items-center gap-1 ${sc.color} px-1.5 py-0.5 rounded-full border`}>{sc.icon} {sc.label}</span>
                    <span className="text-gray-500">{RDV_TYPES.find((t) => t.value === r.rdv_type)?.label}</span>
                    <span className="ml-auto text-gray-400">{new Date(r.created_at).toLocaleDateString("fr-FR")}</span>
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
