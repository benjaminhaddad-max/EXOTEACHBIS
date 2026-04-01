"use client";

import { useState } from "react";
import { HelpCircle, ChevronDown, ChevronRight, BookOpen, ClipboardList, Users, Calendar, Mail, Tag } from "lucide-react";

const FAQ_SECTIONS = [
  {
    id: "pedagogie",
    icon: BookOpen,
    title: "Pédagogie & Cours",
    questions: [
      {
        q: "Comment ajouter un cours au format PDF ?",
        a: "Allez dans Pédagogie > sélectionnez une matière > cliquez sur « Nouveau cours ». Vous pouvez uploader un PDF directement depuis votre ordinateur. Le fichier sera hébergé sur Supabase Storage et accessible aux étudiants.",
      },
      {
        q: "Comment créer une arborescence de dossiers ?",
        a: "Dans Pédagogie, utilisez le bouton « Nouveau dossier » pour créer des UE ou matières. Les dossiers peuvent être imbriqués infiniment. Les matières (feuilles de l'arborescence) contiendront vos cours.",
      },
      {
        q: "Comment rendre un cours visible ou invisible ?",
        a: "Cliquez sur l'icône crayon à côté d'un cours et cochez/décochez « Visible ». Un cours invisible n'apparaît pas pour les élèves mais reste modifiable par les admins.",
      },
      {
        q: "Peut-on assigner un cours à un groupe spécifique ?",
        a: "Actuellement, les cours sont visibles par tous les étudiants connectés. La fonctionnalité d'accès par groupe est prévue dans une prochaine mise à jour.",
      },
    ],
  },
  {
    id: "exercices",
    icon: ClipboardList,
    title: "Exercices & QCM",
    questions: [
      {
        q: "Comment créer une question QCM ?",
        a: "Dans Exercices > onglet « Banque de questions » > cliquez sur « Nouvelle question ». Choisissez la matière, rédigez la question, ajoutez 5 options (A à E) et cochez la bonne réponse. Ajoutez une explication pour la correction.",
      },
      {
        q: "Quelle est la différence entre une série et un examen blanc ?",
        a: "Une série est un ensemble de questions thématiques que les étudiants peuvent faire à leur rythme. Un examen blanc est une simulation avec date/heure définie, compte à rebours et note définitive (non modifiable).",
      },
      {
        q: "Comment créer une série chronométrée ?",
        a: "Dans Exercices > onglet « Séries » > « Nouvelle série ». Activez l'option « Chronométrée » et définissez la durée en minutes. Les étudiants verront un compte à rebours.",
      },
      {
        q: "Les étudiants peuvent-ils refaire une série ?",
        a: "Oui, par défaut. Si vous cochez « Score définitif » lors de la création, la série ne peut être faite qu'une seule fois et le score ne peut pas être effacé.",
      },
    ],
  },
  {
    id: "utilisateurs",
    icon: Users,
    title: "Administration",
    questions: [
      {
        q: "Comment changer le rôle d'un utilisateur ?",
        a: "Dans Administration > trouvez l'utilisateur > cliquez sur l'icône crayon > modifiez le rôle (élève, coach, prof, admin). Les profs et coaches disposent d'un accès staff limité.",
      },
      {
        q: "Comment créer un groupe de promotion ?",
        a: "Dans Administration > colonne « Offres & classes » > utilisez le bouton + de l'offre concernée. Donnez un nom, une couleur, une année et rattachez le groupe à la bonne formation si besoin.",
      },
      {
        q: "Comment inviter un nouvel étudiant ?",
        a: "L'étudiant peut s'inscrire directement sur la page /register avec son email. Vous pouvez ensuite lui assigner un groupe et un rôle depuis l'interface Administration.",
      },
    ],
  },
  {
    id: "planning",
    icon: Calendar,
    title: "Planning & Agenda",
    questions: [
      {
        q: "Comment créer un événement visible par tous ?",
        a: "Dans Planning > « Nouvel événement ». Laissez le champ « Groupe » vide pour que l'événement soit visible par tous les étudiants. Sinon, sélectionnez un groupe spécifique.",
      },
      {
        q: "Peut-on ajouter un lien Zoom à un événement ?",
        a: "Oui. Dans le formulaire de création d'événement, renseignez le champ « Lien Zoom ». Les étudiants verront un bouton « Rejoindre » dans leur agenda.",
      },
      {
        q: "Comment publier une annonce liée à un événement ?",
        a: "Les annonces et le planning sont deux fonctionnalités distinctes. Créez l'événement dans Planning, puis publiez une annonce dans la section Annonces pour informer vos étudiants.",
      },
    ],
  },
];

export default function AidePage() {
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [openQuestion, setOpenQuestion] = useState<string | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-white/90 flex items-center gap-2">
          <HelpCircle size={20} style={{ color: "#C9A84C" }} /> Centre d&apos;aide
        </h1>
        <p className="text-sm text-white/40 mt-0.5">Documentation et réponses aux questions fréquentes</p>
      </div>

      <div className="space-y-3">
        {FAQ_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isSectionOpen = openSection === section.id;
          return (
            <div key={section.id} className="rounded-xl overflow-hidden" style={{ backgroundColor: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <button
                onClick={() => setOpenSection(isSectionOpen ? null : section.id)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors"
                onMouseOver={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.03)"}
                onMouseOut={e => e.currentTarget.style.backgroundColor = "transparent"}
              >
                <Icon size={18} style={{ color: "#C9A84C" }} className="shrink-0" />
                <span className="flex-1 font-semibold text-white/85 text-sm">{section.title}</span>
                <span className="text-xs text-white/30 mr-2">{section.questions.length} questions</span>
                {isSectionOpen ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />}
              </button>

              {isSectionOpen && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {section.questions.map((item, idx) => {
                    const key = `${section.id}-${idx}`;
                    const isOpen = openQuestion === key;
                    return (
                      <div key={key} style={idx > 0 ? { borderTop: "1px solid rgba(255,255,255,0.03)" } : {}}>
                        <button
                          onClick={() => setOpenQuestion(isOpen ? null : key)}
                          className="w-full flex items-start gap-3 px-5 py-3 text-left transition-colors"
                          onMouseOver={e => e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.02)"}
                          onMouseOut={e => e.currentTarget.style.backgroundColor = "transparent"}
                        >
                          <span className="flex-1 text-sm font-medium text-white/70">{item.q}</span>
                          {isOpen ? <ChevronDown size={14} className="text-white/30 shrink-0 mt-0.5" /> : <ChevronRight size={14} className="text-white/30 shrink-0 mt-0.5" />}
                        </button>
                        {isOpen && (
                          <div className="px-5 pb-4">
                            <p className="text-sm leading-relaxed rounded-lg p-3" style={{ color: "rgba(255,255,255,0.55)", backgroundColor: "rgba(255,255,255,0.02)" }}>{item.a}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="rounded-xl p-5" style={{ background: "linear-gradient(135deg, rgba(201,168,76,0.08), rgba(201,168,76,0.03))", border: "1px solid rgba(201,168,76,0.12)" }}>
        <div className="flex items-start gap-3">
          <Mail size={20} style={{ color: "#C9A84C" }} className="shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-white/85 mb-1">Vous n&apos;avez pas trouvé votre réponse ?</h3>
            <p className="text-sm text-white/50 mb-3">Notre équipe support répond sous 24h en jours ouvrés.</p>
            <a href="mailto:support@diplomasante.fr" className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors" style={{ color: "#C9A84C" }}>
              <Mail size={14} /> support@diplomasante.fr
            </a>
          </div>
        </div>
      </div>

      <div className="text-center">
        <span className="inline-flex items-center gap-1.5 text-xs text-white/25">
          <Tag size={11} /> ExoTeach Bis v1.0.0 · Powered by Next.js 16 + Supabase
        </span>
      </div>
    </div>
  );
}
