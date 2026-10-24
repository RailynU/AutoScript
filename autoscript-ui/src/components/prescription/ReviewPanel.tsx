
import { useState } from "react";
import { toast } from "sonner";
import { REVIEW_KIND_TRANSITIONS, REVIEW_KINDS, reviewKindRequiresNote, type PrescriptionDetail, type ReviewKind } from "@/lib/shared";
import { ReviewStatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { REVIEW_KIND_META, REVIEW_STATUS_META } from "@/lib/format";
import { ReviewHistory, ReviewOutcome } from "./ReviewOutcome";

const DEFAULT_PHARMACIST = "Dr. Jane Doe";
const SELECTABLE_KINDS = REVIEW_KINDS.filter((kind) => !REVIEW_KIND_META[kind].legacy);
const KIND_ITEMS = SELECTABLE_KINDS.map((kind) => ({ value: kind, label: REVIEW_KIND_META[kind].label }));

interface ActionFormProps {
  rx: PrescriptionDetail;
  onUpdated: (next: PrescriptionDetail) => void;
}

function ActionForm({ rx, onUpdated }: ActionFormProps) {
  const [name, setName] = useState(DEFAULT_PHARMACIST);
  const [kind, setKind] = useState<ReviewKind>("NOTE");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const noteRequired = reviewKindRequiresNote(kind);
  const noteMissing = noteRequired && notes.trim().length === 0;
  const target = REVIEW_KIND_TRANSITIONS[kind];

  const submit = async () => {
    if (noteMissing) {
      toast.error(`A note is required for “${REVIEW_KIND_META[kind].label}”.`);
      return;
    }
    setBusy(true);
    try {
      const next = await api.review(rx.id, { action: kind, pharmacistName: name.trim() || DEFAULT_PHARMACIST, notes: notes.trim() || null });
      onUpdated(next);
      setNotes("");
      toast.success(target ? `Saved. Review status: ${REVIEW_STATUS_META[target].label}.` : "Saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the review action");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      aria-label="Record a review action"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="review-action">Action</Label>
          <Select value={kind} onValueChange={(v) => v && setKind(v)} items={KIND_ITEMS}>
            <SelectTrigger id="review-action" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIND_ITEMS.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pharmacist">Pharmacist</Label>
          <Input id="pharmacist" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {REVIEW_KIND_META[kind].help}
        {target && <span className="inline-flex items-center gap-1">Sets <ReviewStatusBadge reviewStatus={target} /></span>}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="notes">Note{noteRequired ? " (required)" : " (optional)"}</Label>
        <Textarea id="notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={(touched && noteMissing) || undefined} aria-required={noteRequired} placeholder="What you verified, who you called, what was decided…" />
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button type="submit" disabled={busy || noteMissing}>{busy ? "Saving…" : "Record action"}</Button>
      </div>
    </form>
  );
}

/** Pharmacist disposition panel: outcome at a glance, the action form, then the history timeline. */
export function ReviewPanel({ rx, onUpdated }: ActionFormProps) {
  const processing = rx.status === "PROCESSING";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pharmacist review</CardTitle>
        <p className="text-xs text-muted-foreground">No disposition here means “approved for dispensing”; it records what you did.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <ReviewOutcome rx={rx} />
        {processing ? (
          <p className="text-sm text-muted-foreground">Review actions unlock when processing finishes.</p>
        ) : (
          <ActionForm rx={rx} onUpdated={onUpdated} />
        )}
        <div className="border-t pt-4">
          <h3 className="mb-2 text-sm font-medium">History <span className="font-normal tabular-nums text-muted-foreground">({rx.reviews.length})</span></h3>
          <ReviewHistory reviews={rx.reviews} />
        </div>
      </CardContent>
    </Card>
  );
}
