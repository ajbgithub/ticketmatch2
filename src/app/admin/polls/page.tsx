"use client";
import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// Simple admin-only UI to create, list, and delete polls.
// Requires RLS policies:
//   create policy "polls insert admin" on public.polls for insert with check (public.is_admin());
//   create policy "polls delete admin" on public.polls for delete using (public.is_admin());
// Also see: get_poll_totals(p_poll_id uuid) for tallying votes elsewhere.

export default function AdminPollsPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [polls, setPolls] = useState<any[]>([]);

  const [question, setQuestion] = useState("");
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) { setIsAdmin(false); setLoading(false); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", session.user.id)
        .maybeSingle();

      const admin = !!prof?.is_admin;
      setIsAdmin(admin);
      if (!admin) { setLoading(false); return; }

      await refresh();
      setLoading(false);
    })();
  }, []);

  async function refresh() {
    const { data, error } = await supabase
      .from("polls")
      .select("id, question, slug, created_at")
      .order("created_at", { ascending: false });
    if (!error && data) setPolls(data);
  }

  function toSlug(s: string) {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .slice(0, 64);
  }

  async function createPoll(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");

    const q = question.trim();
    const s = (slug || toSlug(question)).trim();

    if (!q) { setError("Please enter a question."); return; }
    if (!s) { setError("Please provide a slug or a question I can slugify."); return; }

    // Ensure slug uniqueness client-side (RLS will still enforce server-side via unique index)
    if (polls.some(p => p.slug === s)) {
      setError("Slug already exists. Choose another.");
      return;
    }

    const { error: insErr } = await supabase.from("polls").insert({ question: q, slug: s });
    if (insErr) { setError(insErr.message); return; }

    setQuestion("");
    setSlug("");
    setSuccess("Poll created.");
    await refresh();
  }

  async function deletePoll(id: string) {
    setError("");
    setSuccess("");
    const { error: delErr } = await supabase.from("polls").delete().eq("id", id);
    if (delErr) { setError(delErr.message); return; }
    setSuccess("Poll deleted.");
    setPolls(prev => prev.filter(p => p.id !== id));
  }

  if (loading) return <div className="p-6">Loading…</div>;
  if (!isAdmin) return <div className="p-6">403 – Admins only.</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Create & Manage Polls</h1>

      <form onSubmit={createPoll} className="space-y-3 p-4 border rounded-2xl bg-white">
        <div>
          <label className="block text-sm font-medium text-gray-700">Question</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g. Would you ever consider selling above market price?"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Slug (optional)</label>
          <input
            className="mt-1 w-full rounded-xl border px-3 py-2"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. selling-above-market"
          />
          <p className="text-xs text-gray-500 mt-1">If left blank, a slug will be generated from the question.</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="submit" className="rounded-xl px-4 py-2 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-500">Create Poll</button>
          {success && <span className="text-green-600 text-sm">{success}</span>}
          {error && <span className="text-red-600 text-sm">{error}</span>}
        </div>
      </form>

      <section className="p-4 border rounded-2xl bg-white">
        <h2 className="font-semibold mb-3">Existing Polls</h2>
        {polls.length === 0 ? (
          <div className="text-sm text-gray-500">No polls yet.</div>
        ) : (
          <ul className="divide-y">
            {polls.map((p) => (
              <li key={p.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.question}</div>
                  <div className="text-xs text-gray-500">Slug: {p.slug || "(none)"} · Created: {new Date(p.created_at).toLocaleString()}</div>
                </div>
                <button
                  onClick={() => deletePoll(p.id)}
                  className="rounded-lg px-3 py-1 text-sm border text-red-600 hover:bg-red-50"
                >Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="text-xs text-gray-500">
        <p>Tip: In your user UI, store votes in <code>poll_votes</code> by upserting <code>{`{ poll_id, user_id, choice: 'yes'|'no' }`}</code>. Use <code>get_poll_totals</code> to display aggregated results.</p>
      </section>
    </div>
  );
}
