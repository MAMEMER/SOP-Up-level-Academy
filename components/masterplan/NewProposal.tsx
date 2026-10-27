"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ProposalForm } from "./ProposalForm.tsx";
import { readLocal } from "../../lib/masterplan-client.ts";
import { useEffect } from "react";

// "เสนอใหม่" — collapsed to one button; opens by itself when there's an unsaved draft.

export function NewProposal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const draft = readLocal<{ title?: string; newText?: string; oldText?: string }>("mp-new-proposal");
    if (draft && (draft.title || draft.newText || draft.oldText)) setOpen(true);
  }, []);
  if (!open) {
    return (
      <div className="mp-actions">
        <button type="button" className="mp-btn mp-btn--primary" onClick={() => setOpen(true)}>
          <Plus size={16} aria-hidden="true" /> เสนอใหม่
        </button>
      </div>
    );
  }
  return (
    <div className="mp-inline">
      <p className="mp-inline__title">เสนอใหม่</p>
      <ProposalForm draftKey="mp-new-proposal" onCancel={() => setOpen(false)} />
    </div>
  );
}
