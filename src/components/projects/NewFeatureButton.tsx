"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { createFeature, type FeatureFormState } from "@/app/actions/features";

const initial: FeatureFormState = { ok: true };

export function NewFeatureButton({
  projectId,
  areaId,
  areaName,
}: {
  projectId: string;
  areaId: string;
  areaName: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, , pending] = useActionState(createFeature, initial);

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        data-testid="new-feature-button"
        data-area-id={areaId}
      >
        + Feature
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title={`New feature in ${areaName}`}
        description="Features sit inside areas and own test cases."
      >
        <form
          action={async (fd) => {
            const result = await createFeature(state, fd);
            if (result.ok) setOpen(false);
          }}
          className="flex flex-col gap-4"
        >
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="areaId" value={areaId} />
          <Field
            label="Name"
            required
            htmlFor="feature-name"
            error={state.fieldErrors?.name}
          >
            <Input
              id="feature-name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Recurring Payments"
              autoFocus
              data-testid="feature-name-input"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="feature-description"
            error={state.fieldErrors?.description}
          >
            <Textarea id="feature-description" name="description" maxLength={2000} />
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
            <Button type="submit" disabled={pending} data-testid="feature-submit">
              {pending ? "Creating…" : "Create feature"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
