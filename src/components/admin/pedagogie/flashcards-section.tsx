"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Layers, Loader2, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createDeck, updateDeck, deleteDeck, createCard, updateCard, deleteCard } from "@/app/(admin)/admin/flashcards/actions";

type Card = { id: string; front: string; back: string; order_index: number };
type Deck = {
  id: string; name: string; description: string | null;
  matiere_id: string | null; cours_id: string | null;
  visible: boolean; cards?: Card[];
};

interface FlashcardsSectionProps {
  /** The dossier (UE/matière) ID — used to find matieres inside */
  dossierId: string;
  cours: { id: string; name: string }[];
}

export function FlashcardsSection({ dossierId, cours }: FlashcardsSectionProps) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [editingDeck, setEditingDeck] = useState<Deck | null>(null);

  // New deck form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCoursId, setNewCoursId] = useState<string>("");

  // New card form
  const [addingCardToDeck, setAddingCardToDeck] = useState<string | null>(null);
  const [cardFront, setCardFront] = useState("");
  const [cardBack, setCardBack] = useState("");

  const supabase = createClient();

  const [matiereIds, setMatiereIds] = useState<string[]>([]);

  const loadDecks = async () => {
    setLoading(true);

    // 1. Resolve matière IDs inside this dossier
    const { data: matieres } = await supabase
      .from("matieres")
      .select("id")
      .eq("dossier_id", dossierId);
    const matIds = (matieres || []).map(m => m.id);
    setMatiereIds(matIds);

    // 2. Build OR filter: matiere_id in resolved matières OR cours_id in cours list
    const coursIds = cours.map(c => c.id);
    const conditions: string[] = [];
    if (matIds.length > 0) conditions.push(`matiere_id.in.(${matIds.join(",")})`);
    if (coursIds.length > 0) conditions.push(`cours_id.in.(${coursIds.join(",")})`);

    if (conditions.length === 0) {
      setDecks([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from("flashcard_decks")
      .select("*")
      .or(conditions.join(","))
      .order("created_at", { ascending: false });

    setDecks((data as Deck[]) || []);
    setLoading(false);
  };

  useEffect(() => { loadDecks(); }, [dossierId]);

  const loadCards = async (deckId: string) => {
    const { data } = await supabase
      .from("flashcards")
      .select("*")
      .eq("deck_id", deckId)
      .order("order_index");
    setDecks(prev => prev.map(d => d.id === deckId ? { ...d, cards: (data as Card[]) || [] } : d));
  };

  const toggleExpand = (deckId: string) => {
    if (expandedDeck === deckId) {
      setExpandedDeck(null);
    } else {
      setExpandedDeck(deckId);
      const deck = decks.find(d => d.id === deckId);
      if (!deck?.cards) loadCards(deckId);
    }
  };

  const handleCreateDeck = async () => {
    if (!newName.trim()) return;
    await createDeck({
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      matiere_id: matiereIds[0] || null,
      cours_id: newCoursId || null,
    });
    setNewName(""); setNewDesc(""); setNewCoursId(""); setShowCreate(false);
    loadDecks();
  };

  const handleDeleteDeck = async (id: string) => {
    if (!confirm("Supprimer ce deck et toutes ses cartes ?")) return;
    await deleteDeck(id);
    loadDecks();
  };

  const handleAddCard = async (deckId: string) => {
    if (!cardFront.trim() || !cardBack.trim()) return;
    const deck = decks.find(d => d.id === deckId);
    await createCard({
      deck_id: deckId,
      front: cardFront.trim(),
      back: cardBack.trim(),
      order_index: (deck?.cards?.length ?? 0),
    });
    setCardFront(""); setCardBack(""); setAddingCardToDeck(null);
    loadCards(deckId);
  };

  const handleDeleteCard = async (cardId: string, deckId: string) => {
    await deleteCard(cardId);
    loadCards(deckId);
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 size={18} className="animate-spin text-white/30" /></div>;
  }

  return (
    <div className="space-y-3">
      {/* Deck list */}
      {decks.length === 0 && !showCreate && (
        <div className="text-center py-8">
          <Layers size={24} className="mx-auto text-white/15 mb-2" />
          <p className="text-xs text-white/30">Aucun deck de flashcards</p>
          <button
            onClick={() => setShowCreate(true)}
            className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors"
          >
            <Plus size={12} /> Nouveau deck
          </button>
        </div>
      )}

      {decks.map(deck => {
        const isExpanded = expandedDeck === deck.id;
        const coursName = cours.find(c => c.id === deck.cours_id)?.name;

        return (
          <div key={deck.id} className="rounded-xl border border-white/8 bg-white/[0.02] overflow-hidden">
            {/* Deck header */}
            <div
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors"
              onClick={() => toggleExpand(deck.id)}
            >
              {isExpanded
                ? <ChevronDown size={12} className="text-indigo-400 shrink-0" />
                : <ChevronRight size={12} className="text-white/30 shrink-0" />
              }
              <Layers size={13} className="text-indigo-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-bold text-white/80">{deck.name}</span>
                {coursName && (
                  <span className="ml-2 text-[9px] text-white/30">· {coursName}</span>
                )}
              </div>
              <span className="text-[10px] text-white/30 shrink-0">
                {deck.cards?.length ?? "..."} cartes
              </span>
              {!deck.visible && <EyeOff size={11} className="text-white/20 shrink-0" />}
              <button
                onClick={(e) => { e.stopPropagation(); handleDeleteDeck(deck.id); }}
                className="p-1 rounded hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-colors shrink-0"
              >
                <Trash2 size={11} />
              </button>
            </div>

            {/* Cards list */}
            {isExpanded && (
              <div className="border-t border-white/5 px-3 py-2 space-y-1.5">
                {deck.cards?.map((card, idx) => (
                  <div key={card.id} className="flex items-start gap-2 py-1.5 px-2 rounded-lg bg-white/[0.02] group">
                    <span className="text-[9px] text-white/20 font-mono mt-0.5 shrink-0 w-4">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-white/70 leading-tight">{card.front}</p>
                      <p className="text-[10px] text-white/40 leading-tight mt-0.5">{card.back}</p>
                    </div>
                    <button
                      onClick={() => handleDeleteCard(card.id, deck.id)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-red-500/20 text-white/20 hover:text-red-400 transition-all shrink-0"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}

                {/* Add card form */}
                {addingCardToDeck === deck.id ? (
                  <div className="space-y-1.5 pt-1">
                    <input
                      value={cardFront}
                      onChange={e => setCardFront(e.target.value)}
                      placeholder="Recto (question)..."
                      className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
                    />
                    <input
                      value={cardBack}
                      onChange={e => setCardBack(e.target.value)}
                      placeholder="Verso (réponse)..."
                      className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
                      onKeyDown={e => { if (e.key === "Enter") handleAddCard(deck.id); }}
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => handleAddCard(deck.id)}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors">
                        Ajouter
                      </button>
                      <button onClick={() => { setAddingCardToDeck(null); setCardFront(""); setCardBack(""); }}
                        className="px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/30 hover:text-white/50 transition-colors">
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingCardToDeck(deck.id)}
                    className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg border border-dashed border-white/10 text-[10px] font-semibold text-white/25 hover:text-indigo-300 hover:border-indigo-400/30 transition-colors"
                  >
                    <Plus size={10} /> Ajouter une carte
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Create deck form */}
      {showCreate ? (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-3 space-y-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nom du deck..."
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
            autoFocus
          />
          <input
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            placeholder="Description (optionnel)..."
            className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/80 placeholder:text-white/25 focus:outline-none focus:border-indigo-400/40"
          />
          {cours.length > 0 && (
            <select
              value={newCoursId}
              onChange={e => setNewCoursId(e.target.value)}
              className="w-full text-xs bg-white/5 border border-white/10 rounded-lg px-2.5 py-2 text-white/80 focus:outline-none focus:border-indigo-400/40"
            >
              <option value="">Matière entière</option>
              {cours.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <div className="flex gap-1.5">
            <button onClick={handleCreateDeck}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors">
              Créer
            </button>
            <button onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white/30 hover:text-white/50 transition-colors">
              Annuler
            </button>
          </div>
        </div>
      ) : decks.length > 0 && (
        <button
          onClick={() => setShowCreate(true)}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl border border-dashed text-xs font-semibold text-indigo-300 border-indigo-400/30 hover:bg-indigo-500/5 transition-colors"
        >
          <Plus size={12} /> Nouveau deck
        </button>
      )}
    </div>
  );
}
