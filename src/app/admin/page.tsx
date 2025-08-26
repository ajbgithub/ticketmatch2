"use client";
const { data } = await supabase.rpc("get_poll_totals", { p_poll_id: selectedPoll });
if (data && data.length) setPollTotals(data[0]);
})();
}, [selectedPoll]);


if (isAdmin === null) return <div className="p-6">Loading…</div>;
if (!isAdmin) return <div className="p-6">403 – Admins only.</div>;


async function deleteComment(id: string) {
await supabase.from("comments").delete().eq("id", id);
setComments(prev => prev.filter(c => c.id !== id));
}
async function deletePosting(id: string) {
await supabase.from("postings").delete().eq("id", id);
setPostings(prev => prev.filter(p => p.id !== id));
}


return (
<div className="max-w-6xl mx-auto p-6 space-y-6">
<h1 className="text-2xl font-bold">Organizer Admin</h1>


<section className="grid gap-4 md:grid-cols-3">
<div className="p-4 border rounded-xl bg-white">
<h2 className="font-semibold mb-2">Poll totals</h2>
<select className="border rounded p-2 w-full" value={selectedPoll} onChange={e => setSelectedPoll(e.target.value)}>
<option value="">Select a poll…</option>
{polls.map(p => <option key={p.id} value={p.id}>{p.question}</option>)}
</select>
{pollTotals && (
<div className="mt-3 text-sm">
<div>Yes: <strong>{pollTotals.yes_count}</strong></div>
<div>No: <strong>{pollTotals.no_count}</strong></div>
</div>
)}
</div>


<div className="p-4 border rounded-xl bg-white">
<h2 className="font-semibold mb-2">Trade stats</h2>
<div className="text-sm">Total trades: <strong>{tradeStats?.total_trades ?? 0}</strong></div>
<div className="text-sm">Total tickets traded: <strong>{tradeStats?.total_tickets ?? 0}</strong></div>
</div>


<div className="p-4 border rounded-xl bg-white">
<h2 className="font-semibold mb-2">Polls</h2>
<ul className="text-sm space-y-1 max-h-48 overflow-auto">
{polls.map(p => (
<li key={p.id} className="flex justify-between gap-2">
<span>{p.question}</span>
<span className="text-gray-500">({p.slug || p.id.slice(0,8)})</span>
</li>
))}
</ul>
</div>
</section>


<section className="grid md:grid-cols-2 gap-4">
<div className="p-4 border rounded-xl bg-white">
<h2 className="font-semibold mb-3">Community Chat (latest 100)</h2>
<ul className="space-y-2 max-h-96 overflow-auto text-sm">
{comments.map(c => (
<li key={c.id} className="flex items-start justify-between gap-3 border-b pb-2">
<div>
<div className="font-medium">{c.username}</div>
<div className="text-gray-700">{c.message}</div>
<div className="text-xs text-gray-400">{new Date(c.created_at).toLocaleString()}</div>
</div>
<button onClick={() => deleteComment(c.id)} className="text-red-600 border rounded px-2 py-1 hover:bg-red-50">Delete</button>
</li>
))}
</ul>
</div>


<div className="p-4 border rounded-xl bg-white">
<h2 className="font-semibold mb-3">Listings (latest 100)</h2>
<ul className="space-y-2 max-h-96 overflow-auto text-sm">
{postings.map(p => (
<li key={p.id} className="flex items-start justify-between gap-3 border-b pb-2">
<div>
<div className="font-medium">{p.name} – {p.role} @ {p.percent}%</div>
<div className="text-gray-700">Event: {p.event_id}</div>
<div className="text-xs text-gray-400">{new Date(p.created_at).toLocaleString()}</div>
</div>
<button onClick={() => deletePosting(p.id)} className="text-red-600 border rounded px-2 py-1 hover:bg-red-50">Delete</button>
</li>
))}
</ul>
</div>
</section>
</div>
);
}