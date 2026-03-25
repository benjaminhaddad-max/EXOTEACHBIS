"use client";

import { useState, useTransition } from "react";
import {
  MessageSquare, Plus, Trash2, ChevronDown, ChevronRight,
  Send, Check, AlertCircle, Loader2, User
} from "lucide-react";
import { createPost, deletePost } from "@/app/(eleve)/forum/actions";
import type { Profile } from "@/types/database";

type PostWithReplies = {
  id: string;
  content: string;
  type: string;
  pinned: boolean;
  created_at: string;
  author: Profile | null;
  replies: {
    id: string;
    content: string;
    created_at: string;
    author: Profile | null;
  }[];
};

type Toast = { message: string; kind: "success" | "error" } | null;

export function ForumShell({
  initialPosts,
  currentUser,
  currentUserRole,
}: {
  initialPosts: PostWithReplies[];
  currentUser: string;
  currentUserRole: string;
}) {
  const [posts, setPosts] = useState<PostWithReplies[]>(initialPosts);
  const [newQuestion, setNewQuestion] = useState("");
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replying, setReplying] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  const showToast = (message: string, kind: "success" | "error") => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
  };

  const refreshPosts = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    const { data } = await supabase
      .from("posts")
      .select("*, author:profiles(id, first_name, last_name, email, role), replies:posts!parent_id(*, author:profiles(id, first_name, last_name, email, role))")
      .is("parent_id", null)
      .in("type", ["forum_question", "annonce"])
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false });
    if (data) setPosts(data as PostWithReplies[]);
  };

  const handlePostQuestion = () => {
    if (!newQuestion.trim()) return;
    startTransition(async () => {
      const res = await createPost({ content: newQuestion, type: "forum_question" });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setNewQuestion("");
      await refreshPosts();
      showToast("Question postée !", "success");
    });
  };

  const handleReply = (postId: string) => {
    const text = replyText[postId];
    if (!text?.trim()) return;
    startTransition(async () => {
      const res = await createPost({ content: text, parent_id: postId, type: "forum_reply" });
      if ("error" in res) { showToast(res.error!, "error"); return; }
      setReplyText((prev) => ({ ...prev, [postId]: "" }));
      setReplying(null);
      await refreshPosts();
      showToast("Réponse envoyée !", "success");
    });
  };

  const handleDelete = (id: string) => {
    if (!confirm("Supprimer ce message ?")) return;
    startTransition(async () => {
      const res = await deletePost(id);
      if ("error" in res) { showToast(res.error!, "error"); return; }
      await refreshPosts();
      showToast("Message supprimé", "success");
    });
  };

  const isAdmin = ["admin", "superadmin", "prof"].includes(currentUserRole);

  return (
    <div className="max-w-3xl space-y-6">
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
            toast.kind === "success" ? "bg-green-600/90 text-white" : "bg-red-600/90 text-white"
          }`}
        >
          {toast.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.message}
        </div>
      )}

      {/* New question */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Poser une question</h3>
        <textarea
          value={newQuestion}
          onChange={(e) => setNewQuestion(e.target.value)}
          rows={3}
          placeholder="Votre question..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none"
        />
        <div className="flex justify-end mt-3">
          <button
            onClick={handlePostQuestion}
            disabled={isPending || !newQuestion.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-navy text-white text-sm font-semibold rounded-lg hover:bg-navy-light disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Publier
          </button>
        </div>
      </div>

      {/* Posts list */}
      {posts.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-200 p-12 text-center">
          <MessageSquare className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-400">Aucune question pour l'instant. Soyez le premier !</p>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isExpanded = expanded.has(post.id);
            const isReplying = replying === post.id;
            const authorName = post.author
              ? `${post.author.first_name ?? ""} ${post.author.last_name ?? ""}`.trim() || post.author.email
              : "Anonyme";
            const canDelete = post.author?.id === currentUser || isAdmin;

            return (
              <div key={post.id} className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                {/* Post header */}
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-navy/10 flex items-center justify-center text-navy text-xs font-semibold shrink-0">
                        {authorName[0]?.toUpperCase() ?? <User size={14} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-gray-700">{authorName}</span>
                          {post.author?.role && ["admin", "superadmin", "prof"].includes(post.author.role) && (
                            <span className="text-xs px-1.5 py-0.5 rounded bg-navy/10 text-navy font-medium">
                              {post.author.role === "prof" ? "Professeur" : "Admin"}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">
                            {new Date(post.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 mt-1 leading-relaxed">{post.content}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canDelete && (
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="p-1.5 hover:bg-red-50 rounded-lg text-gray-300 hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-4 mt-3 pl-11">
                    <button
                      onClick={() => setReplying(isReplying ? null : post.id)}
                      className="text-xs text-navy hover:underline"
                    >
                      Répondre
                    </button>
                    {post.replies.length > 0 && (
                      <button
                        onClick={() => setExpanded((prev) => {
                          const next = new Set(prev);
                          if (next.has(post.id)) next.delete(post.id);
                          else next.add(post.id);
                          return next;
                        })}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                      >
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {post.replies.length} réponse{post.replies.length !== 1 ? "s" : ""}
                      </button>
                    )}
                  </div>
                </div>

                {/* Reply input */}
                {isReplying && (
                  <div className="px-5 pb-4 pl-16 border-t border-gray-100 pt-3">
                    <textarea
                      value={replyText[post.id] ?? ""}
                      onChange={(e) => setReplyText((prev) => ({ ...prev, [post.id]: e.target.value }))}
                      rows={2}
                      placeholder="Votre réponse..."
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-navy/20 resize-none"
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => setReplying(null)}
                        className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => handleReply(post.id)}
                        disabled={isPending || !(replyText[post.id]?.trim())}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white text-xs font-semibold rounded-lg disabled:opacity-50 hover:bg-navy-light transition-colors"
                      >
                        {isPending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                        Envoyer
                      </button>
                    </div>
                  </div>
                )}

                {/* Replies */}
                {isExpanded && post.replies.length > 0 && (
                  <div className="border-t border-gray-100 divide-y divide-gray-50">
                    {post.replies
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((reply) => {
                        const rAuthor = reply.author
                          ? `${reply.author.first_name ?? ""} ${reply.author.last_name ?? ""}`.trim() || reply.author.email
                          : "Anonyme";
                        const canDeleteReply = reply.author?.id === currentUser || isAdmin;
                        return (
                          <div key={reply.id} className="flex items-start gap-3 px-5 py-3 pl-16 bg-gray-50/50">
                            <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 text-xs font-semibold shrink-0">
                              {rAuthor[0]?.toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-600">{rAuthor}</span>
                                {reply.author?.role && ["admin", "superadmin", "prof"].includes(reply.author.role) && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-navy/10 text-navy font-medium">
                                    {reply.author.role === "prof" ? "Professeur" : "Admin"}
                                  </span>
                                )}
                                <span className="text-xs text-gray-400">
                                  {new Date(reply.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                                </span>
                              </div>
                              <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{reply.content}</p>
                            </div>
                            {canDeleteReply && (
                              <button
                                onClick={() => handleDelete(reply.id)}
                                className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-500 transition-colors shrink-0"
                              >
                                <Trash2 size={12} />
                              </button>
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
      )}
    </div>
  );
}
