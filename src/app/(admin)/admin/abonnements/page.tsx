import { createClient } from "@/lib/supabase/server";
import { CreditCard, Check, ExternalLink, Users } from "lucide-react";

export const dynamic = "force-dynamic";

const PLANS = [
  {
    id: "mensuel",
    name: "Mensuel",
    price: "29€",
    period: "/mois",
    features: ["Accès illimité aux cours", "QCM illimités", "Forum & équipe", "Agenda & planning", "Support email"],
    highlight: false,
  },
  {
    id: "trimestriel",
    name: "Trimestriel",
    price: "69€",
    period: "/trimestre",
    saving: "Économisez 18€",
    features: ["Tout le plan Mensuel", "Flashcards illimitées", "Examens blancs", "Statistiques avancées", "Support prioritaire"],
    highlight: true,
  },
  {
    id: "annuel",
    name: "Annuel",
    price: "199€",
    period: "/an",
    saving: "Économisez 149€",
    features: ["Tout le plan Trimestriel", "Export des données", "API d'intégration", "Formation équipe incluse", "SLA 99.9%"],
    highlight: false,
  },
];

export default async function AbonnementsPage() {
  const supabase = await createClient();

  const { data: abonnements } = await supabase
    .from("abonnements")
    .select("*, user:profiles(first_name, last_name, email)")
    .order("created_at", { ascending: false })
    .limit(20);

  const activeCount = (abonnements ?? []).filter((a: any) => a.status === "active").length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard size={20} className="text-indigo-600" /> Abonnements
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">{activeCount} abonnement{activeCount !== 1 ? "s" : ""} actif{activeCount !== 1 ? "s" : ""}</p>
      </div>

      {/* Plans */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4">Formules disponibles</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {PLANS.map((plan) => (
            <div key={plan.id} className={`rounded-xl border-2 p-5 relative ${plan.highlight ? "border-indigo-500 shadow-md" : "border-gray-200"}`}>
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs bg-indigo-600 text-white px-3 py-0.5 rounded-full font-semibold">
                  Populaire
                </span>
              )}
              {plan.saving && (
                <span className="absolute top-3 right-3 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  {plan.saving}
                </span>
              )}
              <h3 className="font-semibold text-gray-900 text-base mb-1">{plan.name}</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-2xl font-bold text-gray-900">{plan.price}</span>
                <span className="text-sm text-gray-500">{plan.period}</span>
              </div>
              <ul className="space-y-2 mb-5">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check size={14} className="text-green-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <div className={`text-center text-sm py-2 rounded-lg font-medium ${plan.highlight ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600"}`}>
                {plan.id === "mensuel" ? "Actuel" : "Configurer Stripe"}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Stripe CTA */}
      <section className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-2">Configurer Stripe Payments</h3>
        <p className="text-sm text-gray-600 mb-4">
          Pour activer la facturation automatique, connectez votre compte Stripe et ajoutez les variables d'environnement dans Vercel :
        </p>
        <div className="bg-white rounded-lg border border-gray-200 p-3 font-mono text-xs text-gray-700 mb-4 space-y-1">
          <p>STRIPE_SECRET_KEY=sk_live_...</p>
          <p>STRIPE_WEBHOOK_SECRET=whsec_...</p>
          <p>NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_...</p>
        </div>
        <a href="#" className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium">
          Documentation Stripe <ExternalLink size={12} />
        </a>
      </section>

      {/* Active subscriptions */}
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Users size={16} /> Abonnements actifs
        </h2>
        {!abonnements || abonnements.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-gray-200 p-8 text-center text-sm text-gray-400">
            Aucun abonnement enregistré. Configurez Stripe pour commencer à traiter des paiements.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Utilisateur</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Plan</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Statut</th>
                  <th className="text-left px-5 py-3 font-medium text-gray-600">Expiration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {abonnements.map((a: any) => {
                  const userName = a.user ? `${a.user.first_name ?? ""} ${a.user.last_name ?? ""}`.trim() || a.user.email : "—";
                  const statusColors: Record<string, string> = {
                    active: "bg-green-100 text-green-700",
                    cancelled: "bg-red-100 text-red-600",
                    past_due: "bg-amber-100 text-amber-700",
                    trialing: "bg-blue-100 text-blue-700",
                  };
                  return (
                    <tr key={a.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-800">{userName}</td>
                      <td className="px-5 py-3 capitalize text-gray-600">{a.plan}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[a.status] ?? "bg-gray-100 text-gray-500"}`}>
                          {a.status}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-500">
                        {a.current_period_end
                          ? new Date(a.current_period_end).toLocaleDateString("fr-FR")
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
