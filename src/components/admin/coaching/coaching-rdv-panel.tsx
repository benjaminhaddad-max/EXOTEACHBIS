"use client";

import { useState, useTransition } from "react";
import { Calendar, Check, AlertCircle, Loader2, Clock, MapPin, Phone, Video } from "lucide-react";
import { assignCoachToRdv, updateRdvRequestStatus } from "@/app/(admin)/admin/coaching/actions";
import type { CoachingRdvRequest, Profile } from "@/types/database";

interface CoachingRdvPanelProps {
  rdvRequests: CoachingRdvRequest[];
  coaches: Profile[];
  students: Profile[];
}

const RDV_TYPE_ICONS: Record<string, React.ReactNode> = {
  physique: <MapPin size={12} />,
  appel: <Phone size={12} />,
  visio: <Video size={12} />,
};

const RDV_TYPE_LABELS: Record<string, string> = {
  physique: "Présentiel",
  appel: "Appel",
  visio: "Visio",
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "bg-yellow-500/15 text-yellow-300 border-yellow-500/30" },
  assigned: { label: "Confirmé", color: "bg-green-500/15 text-green-300 border-green-500/30" },
  completed: { label: "Effectué", color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  cancelled: { label: "Annulé", color: "bg-red-500/15 text-red-300 border-red-500/30" },
};

export function CoachingRdvPanel({ rdvRequests: initialRequests, coaches, students }: CoachingRdvPanelProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState<{ message: string; kind: "success" | "error" } | null>(null);

  const studentMap = new Map(students.map((s) => [s.id, s]));
  const coachMap = new Map(coaches.map((c) => [c.id, c]));

  const showToast = (msg: string, kind: "success" | "error") => {
    setToast({ message: msg, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const handleAssign = (requestId: string, coachId: string) => {
    startTransition(async () => {
      const res = await assignCoachToRdv({ rdv_request_id: requestId, coach_id: coachId });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setRequests((prev) => prev.map((r) => r.id === requestId ? { ...r, assigned_coach_id: coachId, status: "assigned" as const } : r));
      showToast("Coach assigné au RDV", "success");
    });
  };

  const handleStatusChange = (requestId: string, status: "completed" | "cancelled") => {
    startTransition(async () => {
      const res = await updateRdvRequestStatus({ rdv_request_id: requestId, status });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setRequests((prev) => prev.map((r) => r.id === requestId ? { ...r, status } : r));
      showToast("Statut mis à jour", "success");
    });
  };

  const pendingRequests = requests.filter((r) => r.status === "pending");
  const assignedRequests = requests.filter((r) => r.status === "assigned");
  const pastRequests = requests.filter((r) => r.status === "completed" || r.status === "cancelled");

  return (
    <div className="p-5 space-y-6">
      {/* Pending */}
      {pendingRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "#E3C286" }}>
            En attente ({pendingRequests.length})
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((r) => (
              <RdvCard key={r.id} request={r} studentMap={studentMap} coachMap={coachMap} coaches={coaches} onAssign={handleAssign} onStatusChange={handleStatusChange} isPending={isPending} />
            ))}
          </div>
        </div>
      )}

      {/* Assigned */}
      {assignedRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.5)" }}>
            Confirmés ({assignedRequests.length})
          </h3>
          <div className="space-y-2">
            {assignedRequests.map((r) => (
              <RdvCard key={r.id} request={r} studentMap={studentMap} coachMap={coachMap} coaches={coaches} onAssign={handleAssign} onStatusChange={handleStatusChange} isPending={isPending} />
            ))}
          </div>
        </div>
      )}

      {/* Past */}
      {pastRequests.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            Historique ({pastRequests.length})
          </h3>
          <div className="space-y-2">
            {pastRequests.map((r) => (
              <RdvCard key={r.id} request={r} studentMap={studentMap} coachMap={coachMap} coaches={coaches} onAssign={handleAssign} onStatusChange={handleStatusChange} isPending={isPending} />
            ))}
          </div>
        </div>
      )}

      {requests.length === 0 && (
        <div className="flex items-center justify-center h-64 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Aucune demande de RDV
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.kind === "success" ? "bg-green-600" : "bg-red-600"}`}>
          {toast.kind === "success" ? <Check size={14} /> : <AlertCircle size={14} />}
          {toast.message}
        </div>
      )}
    </div>
  );
}

function RdvCard({
  request, studentMap, coachMap, coaches, onAssign, onStatusChange, isPending,
}: {
  request: CoachingRdvRequest;
  studentMap: Map<string, Profile>;
  coachMap: Map<string, Profile>;
  coaches: Profile[];
  onAssign: (id: string, coachId: string) => void;
  onStatusChange: (id: string, status: "completed" | "cancelled") => void;
  isPending: boolean;
}) {
  const student = studentMap.get(request.student_id);
  const coach = request.assigned_coach_id ? coachMap.get(request.assigned_coach_id) : null;
  const sc = STATUS_LABELS[request.status];

  return (
    <div className="rounded-xl px-4 py-3 flex items-center gap-4" style={{ backgroundColor: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Type icon */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(201,168,76,0.15)", color: "#E3C286" }}>
        {RDV_TYPE_ICONS[request.rdv_type]}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white truncate">
            {student ? `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim() || student.email : "Élève"}
          </span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.5)" }}>
            {RDV_TYPE_LABELS[request.rdv_type]}
          </span>
        </div>
        {request.message && (
          <p className="text-[11px] mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>{request.message}</p>
        )}
        <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>
          {new Date(request.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        {(request.status === "pending" || request.status === "assigned") && (
          <select
            value={request.assigned_coach_id ?? ""}
            onChange={(e) => onAssign(request.id, e.target.value)}
            disabled={isPending}
            className="rounded-lg px-2 py-1 text-[11px] text-white focus:outline-none"
            style={{ backgroundColor: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <option value="">Coach...</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
            ))}
          </select>
        )}
        {request.status === "assigned" && (
          <div className="flex gap-1">
            <button onClick={() => onStatusChange(request.id, "completed")} disabled={isPending}
              className="px-2 py-1 rounded text-[10px] font-medium" style={{ backgroundColor: "rgba(52,211,153,0.15)", color: "#6EE7B7" }}>
              Effectué
            </button>
            <button onClick={() => onStatusChange(request.id, "cancelled")} disabled={isPending}
              className="px-2 py-1 rounded text-[10px] font-medium" style={{ backgroundColor: "rgba(239,68,68,0.15)", color: "#FCA5A5" }}>
              Annuler
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
