"use client";

import { useState, useTransition } from "react";
import { Layers, Plus, Pencil, Trash2, X, Check, AlertCircle, Loader2, ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import type { Matiere } from "@/types/database";
import {
  createDeck, updateDeck, deleteDeck, createCard, updateCard, deleteCard,
} from "@/app/(admin)/admin/flashcards/actions";

type Deck = {
  id: string;
  name: string;
  description: string | null;
  matiere_id: string | null;
  visible: boolean;
  nb_cards: number;
  matiere: { name: string; color: string } | null;
};

type Card = {
  id: string;
  deck_id: string;
  front: string;
  back: string;
  order_index: number;
};

type Toast = { message: string; kind: "success" | "error" } | null;
type DeckModal = { type: "create" } | { type: "edit"; deck: Deck } | null;
type CardModal = { type: "create"; deckId: string } | { type: "edit"; card: Card } | null;

export function FlashcardsAdminShell({
  initialDecks,
  matieres,
}: {
  initialDecks: Deck[];
  matieres: Matiere[];
}) {
  const [decks, setDecks] = useState<Deck[]>(initialDecks);
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [deckCards, setDeckCards] = useState<Record<string, Card[]>>({});
  const [deckModal, setDeckModal] = useState<DeckModal>(null);
  const [cardModal, setCardModal] = useState<CardModal>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const loadCards = async (deckId: string) => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb.from("flashcards").select("*").eq("deck_id", deckId).order("order_index");
    if (data) setDeckCards((prev) => ({ ...prev, [deckId]: data as Card[] }));
  };

  const toggleExpand = async (deckId: string) => {
    if (expandedDeck === deckId) {
      setExpandedDeck(null);
    } else {
      setExpandedDeck(deckId);
      if (!deckCards[deckId]) await loadCards(deckId);
    }
  };

  const refreshDecks = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const sb = createClient();
    const { data } = await sb
      .from("flashcard_decks")
      .select("*, matiere:matieres(name, color), flashcards(id)")
      .order("created_at", { ascending: false });
    if (data) setDecks(data.map((d: any) => ({ ...d, nb_cards: d.flashcards?.length ?? 0, flashcards: undefined })) as Deck[]);
  };

  const handleDeleteDeck = (id: string) => {
    if (!confirm("Supprimer ce deck et toutes ses cartes ?")) return;
    startTransition(async () => {
      const res = await deleteDeck(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setDecks((prev) => prev.filter((d) => d.id !== id));
      showToast("Deck supprimé", "success");
    });
  };

  const handleDeleteCard = (cardId: string, deckId: string) => {
    if (!confirm("Supprimer cette carte ?")) return;
    startTransition(async () => {
      const res = await deleteCard(cardId);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setDeckCards((prev) => ({
        ...prev,
        [deckId]: (prev[deckId] ?? []).filter((c) => c.id !== cardId),
      }));
      setDecks((prev) => prev.map((d) => d.id === deckId ? { ...d, nb_cards: d.nb_cards - 1 } : d));
      showToast("Carte supprimée", "success");
    });
  };

  return (
    <div className="space-y-6">
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${toast.kind === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
            <Layers size={20} className="text-indigo-600" /> Flashcards
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{decks.length} deck{decks.length !== 1 ? "s" : ""}</p>
        </div>
        <button
          onClick={() => setDeckModal({ type: "create" })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Plus size={14} /> Nouveau deck
        </button>
      </div>

      {/* Deck list */}
      {decks.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <Layers size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400">Aucun deck créé</p>
        </div>
      ) : (
        <div className="space-y-3">
          {decks.map((deck) => {
            const isExpanded = expandedDeck === deck.id;
            const cards = deckCards[deck.id] ?? [];
            return (
              <div key={deck.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Deck header */}
                <div className="flex items-center gap-3 p-4">
                  <button onClick={() => toggleExpand(deck.id)} className="text-gray-400 hover:text-gray-600">
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">{deck.name}</span>
                      {deck.matiere && (
                        <span className="text-xs px-2 py-0.5 rounded-full text-white font-medium" style={{ backgroundColor: deck.matiere.color }}>
                          {deck.matiere.name}
                        </span>
                      )}
                      {!deck.visible && (
                        <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">Masqué</span>
                      )}
                    </div>
                    {deck.description && <p className="text-xs text-gray-500 mt-0.5 truncate">{deck.description}</p>}
                  </div>
                  <span className="text-xs text-gray-400 shrink-0">{deck.nb_cards} carte{deck.nb_cards !== 1 ? "s" : ""}</span>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setDeckModal({ type: "edit", deck })} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-gray-600 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => handleDeleteDeck(deck.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Expanded cards */}
                {isExpanded && (
                  <div className="border-t border-gray-100 bg-gray-50 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{cards.length} carte{cards.length !== 1 ? "s" : ""}</p>
                      <button
                        onClick={() => setCardModal({ type: "create", deckId: deck.id })}
                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                      >
                        <Plus size={12} /> Ajouter
                      </button>
                    </div>

                    {cards.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">Aucune carte dans ce deck</p>
                    ) : (
                      <div className="grid gap-2">
                        {cards.map((card) => (
                          <div key={card.id} className="bg-white rounded-lg border border-gray-200 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1 min-w-0 grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-xs font-medium text-indigo-600 mb-1">Recto</p>
                                  <p className="text-sm text-gray-800 whitespace-pre-line">{card.front}</p>
                                </div>
                                <div>
                                  <p className="text-xs font-medium text-emerald-600 mb-1">Verso</p>
                                  <p className="text-sm text-gray-600 whitespace-pre-line">{card.back}</p>
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button onClick={() => setCardModal({ type: "edit", card })} className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600">
                                  <Pencil size={12} />
                                </button>
                                <button onClick={() => handleDeleteCard(card.id, deck.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Deck modal */}
      {deckModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setDeckModal(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <DeckForm
              deck={deckModal.type === "edit" ? deckModal.deck : undefined}
              matieres={matieres}
              isPending={isPending}
              onClose={() => setDeckModal(null)}
              onSubmit={(data) => {
                startTransition(async () => {
                  const res = deckModal.type === "edit"
                    ? await updateDeck(deckModal.deck.id, data)
                    : await createDeck(data);
                  if ("error" in res) { showToast(res.error!, "error"); return; }
                  setDeckModal(null);
                  await refreshDecks();
                  showToast(deckModal.type === "create" ? "Deck créé" : "Deck modifié", "success");
                });
              }}
            />
          </div>
        </div>
      )}

      {/* Card modal */}
      {cardModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setCardModal(null)}>
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-lg shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <CardForm
              card={cardModal.type === "edit" ? cardModal.card : undefined}
              deckId={cardModal.type === "create" ? cardModal.deckId : cardModal.card.deck_id}
              isPending={isPending}
              onClose={() => setCardModal(null)}
              onSubmit={(data) => {
                startTransition(async () => {
                  const deckId = cardModal.type === "create" ? cardModal.deckId : cardModal.card.deck_id;
                  const res = cardModal.type === "edit"
                    ? await updateCard(cardModal.card.id, data)
                    : await createCard({ ...data, deck_id: deckId });
                  if ("error" in res) { showToast(res.error!, "error"); return; }
                  setCardModal(null);
                  await loadCards(deckId);
                  if (cardModal.type === "create") {
                    setDecks((prev) => prev.map((d) => d.id === deckId ? { ...d, nb_cards: d.nb_cards + 1 } : d));
                  }
                  showToast(cardModal.type === "create" ? "Carte ajoutée" : "Carte modifiée", "success");
                });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function DeckForm({ deck, matieres, isPending, onClose, onSubmit }: {
  deck?: Deck;
  matieres: Matiere[];
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [name, setName] = useState(deck?.name ?? "");
  const [description, setDescription] = useState(deck?.description ?? "");
  const [matiereId, setMatiereId] = useState(deck?.matiere_id ?? "");
  const [visible, setVisible] = useState(deck?.visible ?? true);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{deck ? "Modifier le deck" : "Nouveau deck"}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Nom du deck *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Acides Aminés Essentiels"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Description</label>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description courte..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400" />
      </div>
      <div>
        <label className="text-xs text-gray-500 mb-1.5 block">Matière (optionnel)</label>
        <select value={matiereId} onChange={(e) => setMatiereId(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-indigo-400">
          <option value="">— Aucune matière —</option>
          {matieres.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} className="w-4 h-4 rounded accent-indigo-600" />
        <span className="text-sm text-gray-700">Visible par les élèves</span>
      </label>
      <div className="flex justify-end gap-3 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Annuler</button>
        <button onClick={() => onSubmit({ name: name.trim(), description: description.trim() || undefined, matiere_id: matiereId || null, visible })}
          disabled={isPending || !name.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {deck ? "Enregistrer" : "Créer"}
        </button>
      </div>
    </div>
  );
}

function CardForm({ card, deckId, isPending, onClose, onSubmit }: {
  card?: Card;
  deckId: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (data: any) => void;
}) {
  const [front, setFront] = useState(card?.front ?? "");
  const [back, setBack] = useState(card?.back ?? "");

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">{card ? "Modifier la carte" : "Nouvelle carte"}</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-indigo-600 mb-1.5 block">Recto (question) *</label>
          <textarea value={front} onChange={(e) => setFront(e.target.value)} rows={6} placeholder="Question ou terme à mémoriser..."
            className="w-full px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:border-indigo-400 resize-none bg-indigo-50/30" />
        </div>
        <div>
          <label className="text-xs font-medium text-emerald-600 mb-1.5 block">Verso (réponse) *</label>
          <textarea value={back} onChange={(e) => setBack(e.target.value)} rows={6} placeholder="Réponse ou définition..."
            className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm focus:outline-none focus:border-emerald-400 resize-none bg-emerald-50/30" />
        </div>
      </div>
      <div className="flex justify-end gap-3">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Annuler</button>
        <button onClick={() => onSubmit({ front: front.trim(), back: back.trim() })}
          disabled={isPending || !front.trim() || !back.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg disabled:opacity-50">
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {card ? "Enregistrer" : "Ajouter"}
        </button>
      </div>
    </div>
  );
}
