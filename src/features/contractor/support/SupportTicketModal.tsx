import type { FormEvent } from 'react';
import type { SupportTicket } from '../types';

interface SupportTicketModalProps {
  isOpen: boolean;
  defaultEmail: string;
  subject: string;
  message: string;
  email: string;
  onClose: () => void;
  onSubjectChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onSubmit: (ticket: SupportTicket) => void;
}

export function SupportTicketModal({
  isOpen,
  defaultEmail,
  subject,
  message,
  email,
  onClose,
  onSubjectChange,
  onMessageChange,
  onEmailChange,
  onSubmit,
}: SupportTicketModalProps) {
  if (!isOpen) return null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit({
      id: `ticket-${Date.now().toString().slice(-4)}`,
      subject,
      message,
      email: email || defaultEmail || 'anonymous@techsavvytechs.com',
      timestamp: new Date().toLocaleString(),
      status: 'Open',
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl text-slate-100 space-y-4">
        <div className="flex justify-between items-start border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-1.5"><span>🛠️</span> Support & Sync Ticket</h3>
            <p className="text-xs text-slate-400">Submit error logs or request help from administrative support.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white font-bold text-sm cursor-pointer">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Issue Category *</label>
            <select value={subject} onChange={(event) => onSubjectChange(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 cursor-pointer">
              <option value="QuickBooks Sync Error">QuickBooks Sync Error (Credentials/API)</option>
              <option value="Timesheet Log Issue">Timesheet / Shift Logging Issue</option>
              <option value="Portal UI Display Error">Portal UI / Feature Display Issue</option>
              <option value="General Admin Question">General Administrative Inquiry</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Contact Email Address *</label>
            <input type="email" required placeholder="support@techsavvytechs.com" value={email} onChange={(event) => onEmailChange(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 mb-1">Error Message / Problem Description *</label>
            <textarea required rows={4} placeholder="Describe the issue, including error messages..." value={message} onChange={(event) => onMessageChange(event.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-amber-500 resize-none" />
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-lg text-xs transition cursor-pointer">Cancel</button>
            <button type="submit" className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs transition cursor-pointer">Submit Ticket</button>
          </div>
        </form>
      </div>
    </div>
  );
}
