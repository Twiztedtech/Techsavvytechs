import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router";
import { CheckCircle2, ExternalLink, GraduationCap, MessageSquare, RotateCcw } from "lucide-react";
import { CrmBadge, CrmButton, CrmCard, CrmInput, CrmKpiTile, CrmPageHeader, CrmTable, CrmTableHead } from "../crm/ui";
import { SuggestionReview } from "../community/SuggestionReview";
import { communityRequest, timeAgo, type Category, type MatrixLesson, type MatrixRow, type Report } from "../community/api";

// CRM module: moderation queue, categories, wiki suggestions and the training completion matrix.
// All data comes through the community handler, which re-checks the caller's role.

type Tab = "reports" | "suggestions" | "categories" | "training";
const errorText = (reason: unknown) => (reason instanceof Error ? reason.message : "Something went wrong. Please try again.");

function ReportsPanel() {
  const [reports, setReports] = useState<Report[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const load = useCallback(() => communityRequest<{ reports: Report[] }>("reports").then((result) => setReports(result.reports)).catch((reason) => setError(errorText(reason))), []);
  useEffect(() => { void load(); }, [load]);
  async function resolve(report: Report, action: "hide" | "dismiss") {
    setBusy(report.id); setError("");
    try { await communityRequest("resolve-report", { body: { id: report.id, action } }); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(""); }
  }
  if (!reports && !error) return <p className="text-sm text-crm-muted">Loading reports…</p>;
  const open = (reports || []).filter((report) => report.status === "open");
  const done = (reports || []).filter((report) => report.status !== "open").slice(0, 10);
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-crm-error/10 px-3 py-2 text-sm text-crm-error">{error}</p>}
      {!open.length && reports && <CrmCard><p className="text-sm text-crm-muted">No open reports. Nothing needs a moderator right now.</p></CrmCard>}
      {open.map((report) => (
        <CrmCard key={report.id}>
          <div className="flex flex-wrap items-center gap-2 text-xs text-crm-muted">
            <CrmBadge tone="warning">Reported {report.targetType}</CrmBadge>
            {report.targetHidden && <CrmBadge tone="error">Already hidden</CrmBadge>}
            <span>by {report.reporterName} · {timeAgo(report.createdAt)}</span>
          </div>
          <p className="mt-3 rounded-lg bg-crm-surface-soft p-3 text-sm text-crm-ink">{report.snippet}</p>
          <p className="mt-2 text-sm text-crm-body"><span className="font-semibold text-crm-ink">Reason:</span> {report.reason}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <CrmButton disabled={busy === report.id} onClick={() => void resolve(report, "hide")}>Hide the post</CrmButton>
            <CrmButton variant="secondary" disabled={busy === report.id} onClick={() => void resolve(report, "dismiss")}>Dismiss report</CrmButton>
            <Link to={`/community/t/${report.threadId}`} target="_blank" className="inline-flex h-10 items-center gap-1.5 px-2 text-sm font-semibold text-crm-ink hover:underline"><ExternalLink className="h-4 w-4" />Open thread</Link>
          </div>
        </CrmCard>
      ))}
      {done.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-crm-muted">Recently resolved</p>
          <CrmTable>
            <CrmTableHead><th className="px-4 py-2.5">Post</th><th className="px-4 py-2.5">Outcome</th><th className="px-4 py-2.5">When</th></CrmTableHead>
            <tbody className="divide-y divide-crm-hairline">{done.map((report) => <tr key={report.id}><td className="max-w-xs truncate px-4 py-2.5">{report.snippet}</td><td className="px-4 py-2.5">{report.outcome === "hidden" ? "Hidden" : "Dismissed"}</td><td className="px-4 py-2.5">{timeAgo(report.createdAt)}</td></tr>)}</tbody>
          </CrmTable>
        </div>
      )}
    </div>
  );
}

function CategoriesPanel({ canEdit }: { canEdit: boolean }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState({ name: "", description: "", order: 50 });
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => communityRequest<{ categories: Category[] }>("categories").then((result) => setCategories(result.categories)).catch((reason) => setError(errorText(reason))), []);
  useEffect(() => { void load(); }, [load]);
  async function save(body: Record<string, unknown>) {
    setBusy(true); setError("");
    try { await communityRequest("category-save", { body }); setDraft({ name: "", description: "", order: 50 }); await load(); }
    catch (reason) { setError(errorText(reason)); }
    finally { setBusy(false); }
  }
  if (!categories && !error) return <p className="text-sm text-crm-muted">Loading categories…</p>;
  return (
    <div className="space-y-4">
      {error && <p role="alert" className="rounded-lg bg-crm-error/10 px-3 py-2 text-sm text-crm-error">{error}</p>}
      <CrmTable>
        <CrmTableHead><th className="px-4 py-2.5">Category</th><th className="px-4 py-2.5">Discussions</th><th className="px-4 py-2.5">Status</th>{canEdit && <th className="px-4 py-2.5" />}</CrmTableHead>
        <tbody className="divide-y divide-crm-hairline">
          {categories?.map((category) => (
            <tr key={category.id}>
              <td className="px-4 py-2.5"><span className="font-semibold text-crm-ink">{category.name}</span><span className="block text-xs text-crm-muted">{category.description}</span></td>
              <td className="px-4 py-2.5">{category.threadCount}</td>
              <td className="px-4 py-2.5">{category.archived ? <CrmBadge tone="neutral">Archived</CrmBadge> : <CrmBadge tone="success">Active</CrmBadge>}</td>
              {canEdit && <td className="px-4 py-2.5 text-right"><CrmButton variant="secondary" className="h-8 px-3" disabled={busy} onClick={() => void save({ id: category.id, name: category.name, description: category.description, order: category.order, archived: !category.archived })}>{category.archived ? "Restore" : "Archive"}</CrmButton></td>}
            </tr>
          ))}
        </tbody>
      </CrmTable>
      {canEdit ? (
        <CrmCard>
          <h3 className="mb-3 text-sm font-semibold text-crm-ink">Add a category</h3>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_6rem_auto]">
            <CrmInput value={draft.name} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: event.target.value })} placeholder="Name" aria-label="Category name" />
            <CrmInput value={draft.description} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, description: event.target.value })} placeholder="Short description" aria-label="Category description" />
            <CrmInput type="number" value={draft.order} onChange={(event: ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, order: Number(event.target.value) })} aria-label="Sort order" />
            <CrmButton disabled={busy || draft.name.trim().length < 2} onClick={() => void save(draft)}>Add</CrmButton>
          </div>
        </CrmCard>
      ) : <p className="text-xs text-crm-muted">Only administrators can add or archive categories.</p>}
    </div>
  );
}

function TrainingPanel() {
  const [data, setData] = useState<{ lessons: MatrixLesson[]; rows: MatrixRow[] } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { communityRequest<{ lessons: MatrixLesson[]; rows: MatrixRow[] }>("training-matrix").then(setData).catch((reason) => setError(errorText(reason))); }, []);
  if (error) return <p role="alert" className="rounded-lg bg-crm-error/10 px-3 py-2 text-sm text-crm-error">{error}</p>;
  if (!data) return <p className="text-sm text-crm-muted">Loading training progress…</p>;
  if (!data.lessons.length) return <CrmCard><p className="text-sm text-crm-muted">No lessons are published yet. Publish lessons from the Training page and progress shows up here.</p></CrmCard>;
  const total = data.lessons.length;
  return (
    <div className="space-y-3">
      <CrmTable>
        <CrmTableHead>
          <th className="sticky left-0 bg-crm-surface-soft px-4 py-2.5">Technician</th>
          <th className="px-4 py-2.5">Done</th>
          {data.lessons.map((lesson) => <th key={lesson.slug} className="min-w-28 px-3 py-2.5 normal-case"><span className="block text-[10px] uppercase text-crm-muted-soft">{lesson.track}</span>{lesson.title}</th>)}
        </CrmTableHead>
        <tbody className="divide-y divide-crm-hairline">
          {data.rows.map((row) => {
            const count = data.lessons.filter((lesson) => row.completed[lesson.slug] && !row.completed[lesson.slug].needsRetake).length;
            return (
              <tr key={row.uid}>
                <td className="sticky left-0 bg-crm-canvas px-4 py-2.5 font-semibold text-crm-ink">{row.name}</td>
                <td className="px-4 py-2.5 tabular-nums">{count}/{total}</td>
                {data.lessons.map((lesson) => {
                  const entry = row.completed[lesson.slug];
                  return <td key={lesson.slug} className="px-3 py-2.5">{!entry ? <span className="text-crm-muted-soft">—</span> : entry.needsRetake ? <span title="Lesson changed since completion" className="text-crm-warning"><RotateCcw className="h-4 w-4" aria-label="Needs a re-read" /></span> : <span title={`Completed ${timeAgo(entry.completedAt)}`} className="text-crm-success"><CheckCircle2 className="h-4 w-4" aria-label="Completed" /></span>}</td>;
                })}
              </tr>
            );
          })}
        </tbody>
      </CrmTable>
      <p className="text-xs text-crm-muted">A circular arrow means the lesson was updated after the technician completed it.</p>
    </div>
  );
}

export function CommunityAdmin({ isAdminTier }: { isAdminTier: boolean }) {
  const [tab, setTab] = useState<Tab>("reports");
  const [stats, setStats] = useState<{ reports: number; suggestions: number } | null>(null);
  const refreshStats = useCallback(async () => {
    try {
      const [reports, suggestions] = await Promise.all([
        communityRequest<{ reports: Report[] }>("reports"),
        communityRequest<{ suggestions: unknown[] }>("wiki-suggestions"),
      ]);
      setStats({ reports: reports.reports.filter((report) => report.status === "open").length, suggestions: suggestions.suggestions.length });
    } catch { /* tab panels show their own errors */ }
  }, []);
  useEffect(() => { void refreshStats(); }, [refreshStats, tab]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "reports", label: "Reports" }, { id: "suggestions", label: "Wiki suggestions" }, { id: "categories", label: "Categories" }, { id: "training", label: "Training progress" },
  ];
  return (
    <div className="space-y-5">
      <CrmPageHeader
        eyebrow="Technicians"
        title="Community & Training"
        action={<div className="flex gap-2"><Link to="/community" target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-crm-hairline px-4 text-sm font-semibold text-crm-ink hover:bg-crm-surface-soft"><MessageSquare className="h-4 w-4" />Open forum</Link><Link to="/learn" target="_blank" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-crm-hairline px-4 text-sm font-semibold text-crm-ink hover:bg-crm-surface-soft"><GraduationCap className="h-4 w-4" />Open training</Link></div>}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <CrmKpiTile label="Open reports" value={stats ? stats.reports : "…"} tone={stats && stats.reports ? "warning" : "success"} detail="Posts flagged by technicians" />
        <CrmKpiTile label="Suggestions waiting" value={stats ? stats.suggestions : "…"} tone={stats && stats.suggestions ? "warning" : "success"} detail="Proposed lesson edits to review" />
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-crm-hairline" role="tablist">
        {tabs.map((item) => <button key={item.id} role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold transition ${tab === item.id ? "border-crm-ink text-crm-ink" : "border-transparent text-crm-muted hover:text-crm-ink"}`}>{item.label}</button>)}
      </div>
      {tab === "reports" && <ReportsPanel />}
      {tab === "suggestions" && <div className="rounded-xl bg-slate-950 p-4"><SuggestionReview onChanged={() => void refreshStats()} /></div>}
      {tab === "categories" && <CategoriesPanel canEdit={isAdminTier} />}
      {tab === "training" && <TrainingPanel />}
    </div>
  );
}
