import type { ReactNode } from "react";
import { X } from "lucide-react";

/**
 * Shared CRM UI primitives — the single design system for /crm and every
 * admin module mounted inside it. Spec: .stitch/crm/DESIGN.md (Cal.com-
 * inspired: white canvas, black primary CTAs, Inter/Cal-Sans type, ~12px
 * card radius, pastel status badges). Never used by the marketing site,
 * contractor portal, or client portal — those keep their own look.
 */

const toneStyles: Record<string, string> = {
  neutral: "bg-crm-surface-card text-crm-ink",
  success: "bg-crm-success/10 text-crm-success",
  warning: "bg-crm-warning/10 text-crm-warning",
  error: "bg-crm-error/10 text-crm-error",
  accent: "bg-crm-accent/10 text-crm-accent",
  orange: "bg-crm-badge-orange/15 text-orange-700",
  pink: "bg-crm-badge-pink/15 text-pink-700",
  violet: "bg-crm-badge-violet/15 text-violet-700",
  emerald: "bg-crm-badge-emerald/15 text-emerald-700",
};

export type CrmTone = keyof typeof toneStyles;

export function CrmBadge({ tone = "neutral", children }: { tone?: CrmTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium ${toneStyles[tone] || toneStyles.neutral}`}>
      {children}
    </span>
  );
}

const buttonVariants = {
  primary: "bg-crm-primary text-crm-on-primary hover:bg-crm-primary-active disabled:bg-crm-primary-disabled disabled:text-crm-muted",
  secondary: "bg-crm-canvas text-crm-ink border border-crm-hairline hover:bg-crm-surface-soft disabled:opacity-50",
  destructive: "bg-crm-error text-white hover:bg-red-600 disabled:opacity-50",
  text: "bg-transparent text-crm-ink hover:underline underline-offset-2 disabled:opacity-50",
};

type CrmButtonProps = Record<string, any> & {
  variant?: keyof typeof buttonVariants;
  className?: string;
  children?: ReactNode;
};

export function CrmButton({ variant = "primary", className = "", children, ...props }: CrmButtonProps) {
  return (
    <button
      type={props.type || "button"}
      className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-semibold transition disabled:cursor-not-allowed ${buttonVariants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function CrmCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-crm-hairline bg-crm-canvas p-5 ${className}`}>{children}</div>;
}

export function CrmPageHeader({ eyebrow, title, action }: { eyebrow?: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div>
        {eyebrow && <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-muted">{eyebrow}</p>}
        <h2 className="crm-display-sm text-crm-ink">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function CrmKpiTile({ label, value, tone = "neutral", detail }: { label: string; value: ReactNode; tone?: CrmTone; detail?: string }) {
  return (
    <div className="rounded-xl border border-crm-hairline bg-crm-canvas p-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-crm-muted">{label}</p>
        <span className={`h-2 w-2 rounded-full ${toneStyles[tone] || toneStyles.neutral}`} />
      </div>
      <p className="crm-display-md mt-2 text-crm-ink">{value}</p>
      {detail && <p className="mt-1 text-[11px] text-crm-muted-soft">{detail}</p>}
    </div>
  );
}

export function CrmInput({ className = "", ...props }: Record<string, any>) {
  return (
    <input
      className={`h-10 w-full rounded-lg border border-crm-hairline bg-crm-canvas px-3.5 text-sm text-crm-ink placeholder-crm-muted-soft outline-none focus:border-crm-ink ${className}`}
      {...props}
    />
  );
}

export function CrmTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-crm-hairline">
      <table className="w-full text-left text-sm text-crm-body">{children}</table>
    </div>
  );
}

export function CrmTableHead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-crm-hairline bg-crm-surface-soft text-[11px] font-semibold uppercase tracking-wide text-crm-muted">
      <tr>{children}</tr>
    </thead>
  );
}

export function CrmModalShell({ title, onClose, children, maxWidth = "max-w-lg" }: { title: string; onClose: () => void; children: ReactNode; maxWidth?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`max-h-[90vh] w-full ${maxWidth} overflow-y-auto rounded-xl border border-crm-hairline bg-crm-canvas p-6 shadow-xl`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="crm-display-sm text-crm-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-crm-muted hover:bg-crm-surface-soft hover:text-crm-ink">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
