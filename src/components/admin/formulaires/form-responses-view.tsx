"use client";

import { useMemo, useState } from "react";
import { Eye, Download, BarChart3 } from "lucide-react";
import type { CoachingIntakeForm, FormAnswerValue, FormField, FormTemplate, Profile } from "@/types/database";

const BAR_PALETTE = ["#C9A84C", "#34D399", "#A78BFA", "#38BDF8", "#F472B6", "#FB923C"];

function profileName(p: Profile | null | undefined) {
  if (!p) return "Inconnu";
  const n = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
  return n || p.email || "Inconnu";
}

function formatDate(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(v));
}

function escapeCsvCell(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatAnswerPlain(v: FormAnswerValue | undefined): string {
  if (v == null) return "";
  if (Array.isArray(v)) return v.join("; ");
  return String(v);
}

function buildResponsesCsv(
  template: FormTemplate,
  fields: FormField[],
  responses: CoachingIntakeForm[]
): string {
  const headers = [
    "Email",
    "Prénom",
    "Nom",
    "Classe",
    "Date de soumission",
    ...fields.map(f => f.label || f.key),
  ];
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const r of responses) {
    const row = [
      r.student?.email ?? "",
      r.student?.first_name ?? "",
      r.student?.last_name ?? "",
      r.groupe?.name ?? "",
      r.submitted_at ? new Date(r.submitted_at).toISOString() : "",
      ...fields.map(f => formatAnswerPlain(r.answers?.[f.key])),
    ];
    lines.push(row.map(escapeCsvCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function isChoiceField(f: FormField) {
  return f.field_type === "radio" || f.field_type === "select" || f.field_type === "checkboxes";
}

type DistRow = { label: string; count: number };

function distributionForField(field: FormField, responses: CoachingIntakeForm[]): DistRow[] {
  const opts = field.options?.filter(Boolean) ?? [];

  if (field.field_type === "checkboxes") {
    const rows: DistRow[] = opts.map(label => ({
      label,
      count: responses.filter(r => {
        const raw = r.answers?.[field.key];
        const arr = Array.isArray(raw) ? raw.map(String) : raw != null && raw !== "" ? [String(raw)] : [];
        return arr.includes(label);
      }).length,
    }));
    const empty = responses.filter(r => {
      const raw = r.answers?.[field.key];
      const arr = Array.isArray(raw) ? raw : [];
      return arr.length === 0;
    }).length;
    if (empty > 0) rows.push({ label: "(aucune case cochée)", count: empty });
    return rows;
  }

  const counts = new Map<string, number>();
  for (const o of opts) counts.set(o, 0);
  counts.set("(vide)", 0);
  counts.set("(autre)", 0);

  for (const r of responses) {
    const raw = r.answers?.[field.key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    const s = v == null || v === "" ? "" : String(v);
    if (!s) counts.set("(vide)", (counts.get("(vide)") ?? 0) + 1);
    else if (opts.includes(s)) counts.set(s, (counts.get(s) ?? 0) + 1);
    else counts.set("(autre)", (counts.get("(autre)") ?? 0) + 1);
  }

  const rows: DistRow[] = opts.map(o => ({ label: o, count: counts.get(o) ?? 0 }));
  if ((counts.get("(vide)") ?? 0) > 0) rows.push({ label: "(vide)", count: counts.get("(vide)")! });
  if ((counts.get("(autre)") ?? 0) > 0) rows.push({ label: "(autre)", count: counts.get("(autre)")! });
  return rows;
}

function DistributionBars({ rows }: { rows: DistRow[] }) {
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="space-y-2.5 mt-3">
      {rows.map((r, i) => (
        <div key={r.label} className="flex items-center gap-2 text-[11px]">
          <span className="w-[min(38%,10rem)] shrink-0 truncate text-white/65" title={r.label}>
            {r.label}
          </span>
          <div className="flex-1 min-w-0 h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${(r.count / max) * 100}%`,
                backgroundColor: BAR_PALETTE[i % BAR_PALETTE.length],
                minWidth: r.count > 0 ? "4px" : 0,
              }}
            />
          </div>
          <span className="w-7 text-right tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.45)" }}>
            {r.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function TextFieldSummary({ field, responses }: { field: FormField; responses: CoachingIntakeForm[] }) {
  const filled = responses.filter(r => {
    const raw = r.answers?.[field.key];
    if (raw == null) return false;
    if (Array.isArray(raw)) return raw.length > 0;
    return String(raw).trim() !== "";
  });
  const samples = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const r of responses) {
      const t = formatAnswerPlain(r.answers?.[field.key]).trim();
      if (!t || seen.has(t)) continue;
      seen.add(t);
      out.push(t.length > 120 ? `${t.slice(0, 117)}…` : t);
      if (out.length >= 5) break;
    }
    return out;
  }, [responses, field.key]);

  return (
    <div className="p-4 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-xs font-semibold text-white">{field.label}</p>
      <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>
        {filled.length} réponse{filled.length !== 1 ? "s" : ""} renseignée{filled.length !== 1 ? "s" : ""} sur {responses.length}
      </p>
      {samples.length > 0 && (
        <ul className="mt-2 space-y-1 text-[10px] list-disc pl-4" style={{ color: "rgba(255,255,255,0.5)" }}>
          {samples.map(s => (
            <li key={s.slice(0, 40)} className="break-words">
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function FormResponsesView({
  template,
  fields,
  responses: responsesRaw,
}: {
  template: FormTemplate;
  fields: FormField[];
  responses: CoachingIntakeForm[];
}) {
  const [selectedResponse, setSelectedResponse] = useState<CoachingIntakeForm | null>(null);

  const responses = useMemo(
    () => [...responsesRaw].sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()),
    [responsesRaw]
  );

  const latest = responses[0]?.submitted_at;
  const choiceFields = useMemo(() => fields.filter(isChoiceField), [fields]);
  const textFields = useMemo(() => fields.filter(f => f.field_type === "short_text" || f.field_type === "long_text"), [fields]);

  const handleExportCsv = () => {
    const csv = buildResponsesCsv(template, fields, responses);
    const safe = (template.slug || "formulaire").replace(/[^\w.-]+/g, "_");
    const d = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `reponses-${safe}-${d}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Résumé compact + export */}
      <div
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-xl"
        style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
          <div>
            <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Total
            </span>
            <span className="text-xl font-bold text-white tabular-nums">{responses.length}</span>
          </div>
          <span className="hidden sm:inline w-px h-8 self-center" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} aria-hidden />
          <div>
            <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Dernière réponse
            </span>
            <span className="text-sm font-semibold text-white">{formatDate(latest)}</span>
          </div>
          <span className="hidden sm:inline w-px h-8 self-center" style={{ backgroundColor: "rgba(255,255,255,0.08)" }} aria-hidden />
          <div>
            <span className="text-[10px] uppercase tracking-wider block mb-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>
              Questions
            </span>
            <span className="text-xl font-bold text-white tabular-nums">{fields.length}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          disabled={responses.length === 0}
          title={responses.length === 0 ? "Aucune réponse à exporter" : "Télécharger toutes les réponses en CSV (Excel)"}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-opacity disabled:opacity-35 disabled:cursor-not-allowed shrink-0"
          style={{ backgroundColor: "rgba(201,168,76,0.18)", color: "#E3C286", border: "1px solid rgba(201,168,76,0.35)" }}
        >
          <Download size={14} />
          Exporter CSV
        </button>
      </div>

      {/* Synthèse type Google Forms */}
      {responses.length > 0 && (choiceFields.length > 0 || textFields.length > 0) && (
        <div className="space-y-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#C9A84C" }}>
            Synthèse des réponses
          </h3>
          <div className="grid gap-3 md:grid-cols-1 lg:grid-cols-2">
            {choiceFields.map(field => {
              const rows = distributionForField(field, responses);
              return (
                <div
                  key={field.id}
                  className="p-4 rounded-xl"
                  style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex items-start gap-2">
                    <BarChart3 size={14} className="shrink-0 mt-0.5" style={{ color: "#C9A84C" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-white leading-snug">{field.label}</p>
                      <p className="text-[9px] mt-0.5 uppercase tracking-wide" style={{ color: "rgba(255,255,255,0.28)" }}>
                        {field.field_type === "checkboxes" ? "Cases à cocher" : field.field_type === "radio" ? "Choix unique" : "Liste"}
                        {" · "}
                        {responses.length} réponse{responses.length !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </div>
                  <DistributionBars rows={rows} />
                </div>
              );
            })}
            {textFields.map(field => (
              <TextFieldSummary key={field.id} field={field} responses={responses} />
            ))}
          </div>
        </div>
      )}

      {responses.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: "rgba(255,255,255,0.3)" }}>
          <BarChart3 size={32} className="mb-3 opacity-30" />
          <p className="text-sm">Aucune réponse pour ce formulaire</p>
          <p className="text-[11px] mt-1 max-w-sm text-center" style={{ color: "rgba(255,255,255,0.22)" }}>
            Les graphiques et l’export CSV apparaîtront dès les premières soumissions.
          </p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-[10px] font-semibold uppercase tracking-widest px-4 pt-3 pb-1" style={{ color: "rgba(255,255,255,0.35)" }}>
            Réponses individuelles
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Élève
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Classe
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Date
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {responses.map((r, i) => (
                <tr
                  key={r.id}
                  className="transition-colors cursor-pointer"
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    backgroundColor: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                  }}
                  onMouseOver={e => (e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.04)")}
                  onMouseOut={e =>
                    (e.currentTarget.style.backgroundColor = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)")
                  }
                  onClick={() => setSelectedResponse(r)}
                >
                  <td className="px-4 py-3 text-white font-medium">{profileName(r.student)}</td>
                  <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {r.groupe?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3" style={{ color: "rgba(255,255,255,0.5)" }}>
                    {formatDate(r.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedResponse(r);
                      }}
                      className="text-[11px] px-2 py-1 rounded-lg transition-colors"
                      style={{ color: "#C9A84C", backgroundColor: "rgba(201,168,76,0.1)" }}
                    >
                      <Eye size={11} className="inline mr-1" /> Détail
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedResponse && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedResponse(null)}
        >
          <div
            className="bg-[#0e1e35] border border-white/15 rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto shadow-2xl p-6"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-white">{profileName(selectedResponse.student)}</h3>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {selectedResponse.groupe?.name ?? "Sans classe"} · {formatDate(selectedResponse.submitted_at)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedResponse(null)} className="text-white/40 hover:text-white text-lg">
                ×
              </button>
            </div>

            <div className="space-y-3">
              {fields.map(f => {
                const answer = selectedResponse.answers?.[f.key];
                const displayValue = Array.isArray(answer) ? answer.join(", ") : answer ?? "—";
                return (
                  <div key={f.id} className="p-3 rounded-xl" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {f.label}
                    </p>
                    <p className="text-sm text-white">
                      {displayValue || <span style={{ color: "rgba(255,255,255,0.2)" }}>Non renseigné</span>}
                    </p>
                  </div>
                );
              })}
              {fields.length === 0 && (
                <p className="text-xs text-center py-4" style={{ color: "rgba(255,255,255,0.3)" }}>
                  Aucun champ configuré
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
