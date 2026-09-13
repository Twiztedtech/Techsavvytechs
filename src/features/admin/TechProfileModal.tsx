import { useState } from "react";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { Plus, Trash2, Wrench } from "lucide-react";
import { db } from "../../lib/firebase";
import { CrmBadge, CrmButton, CrmInput, CrmModalShell } from "../crm/ui";

type ContractorRecord = Record<string, any> & { id: string; name?: string; email?: string };
type Certification = { id: string; name: string; expiryDate: string };

const employmentTypeLabels: Record<string, string> = {
  "1099_contractor": "1099 Contractor",
  w2_employee: "W-2 Employee",
};

function TagList({ tags, onAdd, onRemove, placeholder }: { tags: string[]; onAdd: (tag: string) => void; onRemove: (index: number) => void; placeholder: string }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft("");
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag, index) => (
          <span key={`${tag}-${index}`} className="flex items-center gap-1 rounded-full bg-crm-surface-card px-2.5 py-1 text-[11px] font-medium text-crm-ink">
            {tag}
            <button type="button" onClick={() => onRemove(index)} className="text-crm-muted hover:text-crm-error" aria-label={`Remove ${tag}`}>
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-[11px] text-crm-muted">None added yet.</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink outline-none focus:border-crm-ink"
        />
        <CrmButton type="button" variant="secondary" onClick={add} className="h-9 px-3 text-xs">
          <Plus className="h-3.5 w-3.5" /> Add
        </CrmButton>
      </div>
    </div>
  );
}

function certStatus(expiryDate: string): { label: string; tone: "success" | "warning" | "error" } {
  if (!expiryDate) return { label: "No expiry set", tone: "success" };
  const days = (new Date(expiryDate).getTime() - Date.now()) / 86400000;
  if (days < 0) return { label: "Expired", tone: "error" };
  if (days <= 30) return { label: "Expiring soon", tone: "warning" };
  return { label: "Valid", tone: "success" };
}

export function TechProfileModal({
  contractor,
  onClose,
  onOpenW9,
  onOpenHistory,
}: {
  contractor: ContractorRecord;
  onClose: () => void;
  onOpenW9: () => void;
  onOpenHistory: () => void;
}) {
  const [form, setForm] = useState({
    name: contractor.name || "",
    email: contractor.email || "",
    rate: String(contractor.rate ?? 75),
    specialty: contractor.specialty || "",
    employmentType: contractor.employmentType === "w2_employee" ? "w2_employee" : "1099_contractor",
    businessPhone: contractor.businessPhone || "",
  });
  const [skills, setSkills] = useState<string[]>(Array.isArray(contractor.skills) ? contractor.skills : []);
  const [tools, setTools] = useState<string[]>(Array.isArray(contractor.tools) ? contractor.tools : []);
  const [certifications, setCertifications] = useState<Certification[]>(
    Array.isArray(contractor.certifications) ? contractor.certifications : [],
  );
  const [newCertName, setNewCertName] = useState("");
  const [newCertExpiry, setNewCertExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  const addCertification = () => {
    const name = newCertName.trim();
    if (!name) return;
    setCertifications([...certifications, { id: `${Date.now()}`, name, expiryDate: newCertExpiry }]);
    setNewCertName("");
    setNewCertExpiry("");
  };

  const save = async () => {
    setSaving(true);
    setFeedback("");
    try {
      await updateDoc(doc(db, "contractors", contractor.id), {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        rate: Number(form.rate) || 0,
        specialty: form.specialty.trim(),
        employmentType: form.employmentType,
        businessPhone: form.businessPhone.trim(),
        skills,
        tools,
        certifications,
        updatedAt: serverTimestamp(),
      });
      setFeedback("Profile saved.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not save this profile.");
    } finally {
      setSaving(false);
    }
  };

  const onboardingStatus = contractor.onboarding?.status || "not_started";

  return (
    <CrmModalShell title={form.name || "Technician profile"} onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <CrmBadge tone={contractor.employmentType === "w2_employee" ? "violet" : "neutral"}>
            {employmentTypeLabels[form.employmentType]}
          </CrmBadge>
          <CrmBadge tone={contractorStatusTone(contractor)}>{contractor.accessStatus || (contractor.active === false ? "Suspended" : "Active")}</CrmBadge>
          <CrmBadge tone={onboardingStatus === "approved" ? "success" : onboardingStatus === "needs_update" ? "warning" : "neutral"}>
            W-9: {onboardingStatus.replace("_", " ")}
          </CrmBadge>
          <button type="button" onClick={onOpenW9} className="text-[11px] font-bold text-crm-ink underline underline-offset-2">
            Open W-9
          </button>
          <button type="button" onClick={onOpenHistory} className="text-[11px] font-bold text-crm-ink underline underline-offset-2">
            View timesheet history
          </button>
        </div>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-crm-muted">Contact & basics</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Full name
              <CrmInput className="mt-1.5" value={form.name} onChange={(e: any) => setForm({ ...form, name: e.target.value })} />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Email
              <CrmInput type="email" className="mt-1.5" value={form.email} onChange={(e: any) => setForm({ ...form, email: e.target.value })} />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Business phone
              <CrmInput className="mt-1.5" value={form.businessPhone} onChange={(e: any) => setForm({ ...form, businessPhone: e.target.value })} placeholder="e.g. (555) 123-4567" />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Specialty
              <CrmInput className="mt-1.5" value={form.specialty} onChange={(e: any) => setForm({ ...form, specialty: e.target.value })} placeholder="e.g. Network, DevOps" />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Hourly rate ($/hr)
              <CrmInput type="number" min="0" className="mt-1.5" value={form.rate} onChange={(e: any) => setForm({ ...form, rate: e.target.value })} />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-crm-muted">
              Employment type
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                className="mt-1.5 h-10 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink"
              >
                <option value="1099_contractor">1099 Contractor (paid via QuickBooks Bills)</option>
                <option value="w2_employee">W-2 Employee (payroll — never synced to QuickBooks Bills)</option>
              </select>
            </label>
          </div>
        </section>

        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-crm-muted">Skills</h3>
          <TagList
            tags={skills}
            onAdd={(tag) => setSkills([...skills, tag])}
            onRemove={(index) => setSkills(skills.filter((_, i) => i !== index))}
            placeholder="e.g. Fiber splicing, Low-voltage cabling"
          />
        </section>

        <section>
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-crm-muted">
            <Wrench className="h-3.5 w-3.5" /> Tools & certifications
          </h3>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-crm-muted">Tools</p>
          <TagList
            tags={tools}
            onAdd={(tag) => setTools([...tools, tag])}
            onRemove={(index) => setTools(tools.filter((_, i) => i !== index))}
            placeholder="e.g. Fusion splicer, OTDR"
          />
          <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wider text-crm-muted">Certifications</p>
          <div className="space-y-2">
            {certifications.map((cert, index) => {
              const status = certStatus(cert.expiryDate);
              return (
                <div key={cert.id} className="flex items-center justify-between gap-2 rounded-lg border border-crm-hairline p-2.5">
                  <div>
                    <p className="text-xs font-semibold text-crm-ink">{cert.name}</p>
                    <p className="text-[11px] text-crm-muted">{cert.expiryDate ? `Expires ${cert.expiryDate}` : "No expiry date"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <CrmBadge tone={status.tone}>{status.label}</CrmBadge>
                    <button
                      type="button"
                      aria-label={`Remove ${cert.name}`}
                      onClick={() => setCertifications(certifications.filter((_, i) => i !== index))}
                      className="text-crm-error"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
            {certifications.length === 0 && <p className="text-[11px] text-crm-muted">None added yet.</p>}
          </div>
          <div className="mt-2 grid grid-cols-[1fr_150px_auto] gap-2">
            <input
              value={newCertName}
              onChange={(e) => setNewCertName(e.target.value)}
              placeholder="Certification name"
              className="h-9 rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink outline-none focus:border-crm-ink"
            />
            <input
              type="date"
              value={newCertExpiry}
              onChange={(e) => setNewCertExpiry(e.target.value)}
              className="h-9 rounded-lg border border-crm-hairline bg-crm-canvas px-3 text-xs text-crm-ink outline-none focus:border-crm-ink"
            />
            <CrmButton type="button" variant="secondary" onClick={addCertification} className="h-9 px-3 text-xs">
              <Plus className="h-3.5 w-3.5" /> Add
            </CrmButton>
          </div>
        </section>

        {feedback && <p className={`text-xs font-semibold ${feedback === "Profile saved." ? "text-crm-success" : "text-crm-error"}`}>{feedback}</p>}

        <div className="flex justify-end gap-2 border-t border-crm-hairline-soft pt-4">
          <CrmButton type="button" variant="secondary" onClick={onClose}>
            Close
          </CrmButton>
          <CrmButton type="button" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save profile"}
          </CrmButton>
        </div>
      </div>
    </CrmModalShell>
  );
}

function contractorStatusTone(contractor: ContractorRecord): "success" | "warning" | "accent" | "error" {
  const status = contractor.accessStatus || (contractor.active === false ? "Suspended" : "Active");
  if (status === "Active") return "success";
  if (status === "Suspended") return "warning";
  if (status === "Pending") return "accent";
  return "error";
}
