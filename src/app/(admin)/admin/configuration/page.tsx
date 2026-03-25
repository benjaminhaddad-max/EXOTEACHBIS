"use client";

import { useState } from "react";
import { Settings, Shield, Zap, Link2, Save, Check } from "lucide-react";

export default function ConfigurationPage() {
  const [inscriptionOuverte, setInscriptionOuverte] = useState(true);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Settings size={20} className="text-indigo-600" /> Configuration
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Paramètres globaux de la plateforme</p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          {saved ? <><Check size={14} /> Enregistré</> : <><Save size={14} /> Enregistrer</>}
        </button>
      </div>

      {/* Plateforme */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 bg-gray-50">
          <Settings size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Plateforme</h2>
        </div>
        <div className="p-5 space-y-4">
          <ConfigRow label="Nom de la plateforme" description="Affiché dans les emails et les notifications">
            <input defaultValue="ExoTeach" className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </ConfigRow>
          <ConfigRow label="URL de la plateforme" description="URL de production sur Vercel">
            <input defaultValue="https://exoteachbis.vercel.app" readOnly className="w-64 px-3 py-1.5 border border-gray-100 rounded-lg text-sm text-gray-500 bg-gray-50" />
          </ConfigRow>
          <ConfigToggle label="Inscriptions ouvertes" description="Permettre à de nouveaux étudiants de s'inscrire" value={inscriptionOuverte} onChange={setInscriptionOuverte} />
        </div>
      </section>

      {/* Accès & Sécurité */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 bg-gray-50">
          <Shield size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Accès & Sécurité</h2>
        </div>
        <div className="p-5 space-y-4">
          <ConfigToggle label="Authentification MFA" description="Exiger une double authentification pour les administrateurs" value={mfaRequired} onChange={setMfaRequired} />
          <ConfigRow label="Fournisseur d'authentification" description="Supabase Auth est configuré">
            <span className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 bg-green-100 text-green-700 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Connecté
            </span>
          </ConfigRow>
          <ConfigRow label="Projet Supabase" description="ID du projet actif">
            <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">uylrllyffpypqmitmbme</code>
          </ConfigRow>
        </div>
      </section>

      {/* Intégrations IA */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 bg-gray-50">
          <Zap size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Intégrations IA</h2>
        </div>
        <div className="p-5 space-y-4">
          <ConfigToggle label="Génération IA de QCM" description="Permettre la génération automatique de questions depuis les cours (bientôt disponible)" value={aiEnabled} onChange={setAiEnabled} />
          <ConfigRow label="Clé OpenAI" description="Pour la génération de contenu et la correction IA">
            <input type="password" placeholder="sk-..." className="w-48 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
          </ConfigRow>
        </div>
      </section>

      {/* Connexions */}
      <section className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 bg-gray-50">
          <Link2 size={16} className="text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-700">Connexions & Déploiement</h2>
        </div>
        <div className="p-5 space-y-4">
          <ConfigRow label="Supabase Storage" description="Pour l'hébergement des PDFs de cours">
            <StatusBadge status="active" label="Actif" />
          </ConfigRow>
          <ConfigRow label="Vercel Deployment" description="Déploiement continu depuis GitHub">
            <StatusBadge status="active" label="Actif" />
          </ConfigRow>
          <ConfigRow label="Stripe Payments" description="Facturation et abonnements">
            <StatusBadge status="pending" label="À configurer" />
          </ConfigRow>
        </div>
      </section>
    </div>
  );
}

function ConfigRow({ label, description, children }: { label: string; description: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-800">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function ConfigToggle({ label, description, value, onChange }: { label: string; description: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <ConfigRow label={label} description={description}>
      <button
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? "bg-indigo-600" : "bg-gray-200"}`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </ConfigRow>
  );
}

function StatusBadge({ status, label }: { status: "active" | "pending" | "error"; label: string }) {
  const colors = {
    active: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    error: "bg-red-100 text-red-600",
  };
  const dotColors = {
    active: "bg-green-500",
    pending: "bg-amber-500",
    error: "bg-red-500",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium ${colors[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} /> {label}
    </span>
  );
}
