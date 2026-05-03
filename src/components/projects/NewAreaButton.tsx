"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { createArea, type AreaFormState } from "@/app/actions/areas";

const initial: AreaFormState = { ok: true };

export function NewAreaButton({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [state, , pending] = useActionState(createArea, initial);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        data-testid="new-area-button"
      >
        + New area
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create area"
        description="Areas group features within a project (e.g. Payments, Calendar, Auth)."
      >
        <form
          action={async (fd) => {
            const result = await createArea(state, fd);
            if (result.ok) setOpen(false);
            return result;
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <Field
            label="Name"
            required
            htmlFor="area-name"
            error={state.fieldErrors?.name}
          >
            <Input
              id="area-name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Payments"
              autoFocus
              data-testid="area-name-input"
            />
          </Field>
          <Field
            label="Key"
            hint="Optional. 1–8 uppercase chars used in test IDs (e.g. PAY)."
            htmlFor="area-key"
            error={state.fieldErrors?.key}
          >
            <Input id="area-key" name="key" maxLength={8} placeholder="PAY" />
          </Field>
          <Field
            label="Description"
            htmlFor="area-description"
            error={state.fieldErrors?.description}
          >
            <Textarea id="area-description" name="description" maxLength={2000} />
          </Field>
          {state.message ? (
            <div
              role="alert"
              className="rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
            >
              {state.message}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-testid="area-submit">
              {pending ? "Creating…" : "Create area"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
