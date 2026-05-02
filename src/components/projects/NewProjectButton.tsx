"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Input, Textarea, Field } from "@/components/ui/Input";
import { createProject, type FormState } from "@/app/actions/projects";

const initial: FormState = { ok: true };

export function NewProjectButton() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createProject, initial);

  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="new-project-button">
        + New project
      </Button>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Create project"
        description="A project is the top of the hierarchy: areas → features → test cases."
      >
        <form action={formAction} className="flex flex-col gap-4">
          <Field
            label="Name"
            required
            htmlFor="name"
            error={state.fieldErrors?.name}
          >
            <Input
              id="name"
              name="name"
              required
              minLength={2}
              maxLength={120}
              placeholder="e.g. Acme Storefront"
              autoFocus
              data-testid="project-name-input"
            />
          </Field>
          <Field
            label="Key"
            hint="Optional. Short uppercase code used in test IDs (e.g. AIW). Auto-generated if blank."
            htmlFor="key"
            error={state.fieldErrors?.key}
          >
            <Input
              id="key"
              name="key"
              maxLength={8}
              placeholder="ACM"
              data-testid="project-key-input"
            />
          </Field>
          <Field
            label="Description"
            htmlFor="description"
            error={state.fieldErrors?.description}
          >
            <Textarea
              id="description"
              name="description"
              maxLength={2000}
              placeholder="What does this project cover?"
            />
          </Field>
          {!state.ok && state.message ? (
            <div
              role="alert"
              className="rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
            >
              {state.message}
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending} data-testid="project-submit">
              {pending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </>
  );
}
