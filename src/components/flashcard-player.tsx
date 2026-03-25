"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw, Check, RefreshCw, Layers } from "lucide-react";
import Link from "next/link";

type Deck = {
  id: string;
  name: string;
  description: string | null;
  matiere: { name: string; color: string } | null;
};

type Card = {
  id: string;
  front: string;
  back: string;
  order_index: number;
};

export function FlashcardPlayer({ deck, cards }: { deck: Deck; cards: Card[] }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [toReview, setToReview] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  if (cards.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <Layers size={48} className="text-gray-300 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 mb-2">Deck vide</h2>
        <p className="text-gray-500 mb-6">Ce deck ne contient pas encore de cartes.</p>
        <Link href="/flashcards" className="text-indigo-600 hover:underline text-sm">← Retour aux decks</Link>
      </div>
    );
  }

  const card = cards[currentIndex];
  const progress = (currentIndex / cards.length) * 100;

  const handleFlip = () => setIsFlipped((f) => !f);

  const handleNext = () => {
    setIsFlipped(false);
    if (currentIndex < cards.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      setFinished(true);
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    setCurrentIndex((i) => Math.max(0, i - 1));
  };

  const handleReviewed = () => {
    setReviewed((prev) => new Set([...prev, card.id]));
    setToReview((prev) => { const n = new Set(prev); n.delete(card.id); return n; });
    handleNext();
  };

  const handleToReview = () => {
    setToReview((prev) => new Set([...prev, card.id]));
    setReviewed((prev) => { const n = new Set(prev); n.delete(card.id); return n; });
    handleNext();
  };

  const handleRestart = () => {
    setCurrentIndex(0);
    setIsFlipped(false);
    setReviewed(new Set());
    setToReview(new Set());
    setFinished(false);
  };

  if (finished) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check size={32} className="text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Deck terminé !</h2>
          <p className="text-gray-500 mb-6">{cards.length} cartes passées en revue</p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-green-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{reviewed.size}</p>
              <p className="text-sm text-green-600">Maîtrisées</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-amber-700">{toReview.size}</p>
              <p className="text-sm text-amber-600">À revoir</p>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={handleRestart}
              className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700"
            >
              <RefreshCw size={16} /> Recommencer
            </button>
            <Link href="/flashcards" className="flex items-center justify-center gap-2 w-full px-4 py-3 border border-gray-200 text-gray-700 font-medium rounded-xl hover:bg-gray-50">
              ← Retour aux decks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col p-4 sm:p-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/flashcards" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <ArrowLeft size={16} /> Retour
        </Link>
        <div className="text-center">
          <h1 className="text-sm font-semibold text-gray-900">{deck.name}</h1>
          {deck.matiere && (
            <span className="text-xs text-white px-2 py-0.5 rounded-full" style={{ backgroundColor: deck.matiere.color }}>
              {deck.matiere.name}
            </span>
          )}
        </div>
        <span className="text-sm text-gray-500">{currentIndex + 1}/{cards.length}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 rounded-full mb-6">
        <div className="h-1.5 bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      {/* Card */}
      <div className="flex-1 flex items-center justify-center mb-6">
        <button
          onClick={handleFlip}
          className="w-full group cursor-pointer"
          style={{ perspective: "1000px" }}
        >
          <div
            className="relative w-full transition-transform duration-500"
            style={{
              transformStyle: "preserve-3d",
              transform: isFlipped ? "rotateY(180deg)" : "rotateY(0deg)",
              minHeight: "280px",
            }}
          >
            {/* Front */}
            <div
              className="absolute inset-0 bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-8 flex flex-col items-center justify-center"
              style={{ backfaceVisibility: "hidden" }}
            >
              <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide mb-4">Question</p>
              <p className="text-lg font-semibold text-gray-900 text-center leading-relaxed whitespace-pre-line">{card.front}</p>
              <p className="text-xs text-gray-400 mt-6">Cliquer pour révéler la réponse</p>
            </div>

            {/* Back */}
            <div
              className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-emerald-50 rounded-2xl border-2 border-emerald-200 shadow-lg p-8 flex flex-col items-center justify-center"
              style={{ backfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
            >
              <p className="text-xs font-medium text-emerald-500 uppercase tracking-wide mb-4">Réponse</p>
              <p className="text-sm text-gray-700 text-center leading-relaxed whitespace-pre-line">{card.back}</p>
            </div>
          </div>
        </button>
      </div>

      {/* Actions */}
      <div className="space-y-3">
        {isFlipped ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleToReview}
              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-amber-200 bg-amber-50 text-amber-700 font-semibold rounded-xl hover:bg-amber-100 transition-colors"
            >
              <RotateCcw size={16} /> À revoir
            </button>
            <button
              onClick={handleReviewed}
              className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-green-200 bg-green-50 text-green-700 font-semibold rounded-xl hover:bg-green-100 transition-colors"
            >
              <Check size={16} /> Maîtrisé
            </button>
          </div>
        ) : (
          <button
            onClick={handleFlip}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white font-semibold rounded-xl hover:bg-indigo-700 transition-colors"
          >
            Voir la réponse
          </button>
        )}

        <div className="flex justify-between">
          <button onClick={handlePrev} disabled={currentIndex === 0}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 disabled:opacity-30">
            <ArrowLeft size={16} /> Précédent
          </button>
          <button onClick={() => { setIsFlipped(false); handleNext(); }}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600">
            Passer <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
