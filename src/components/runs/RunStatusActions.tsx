"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogFooter } from "@/components/ui/Dialog";
import { Field, Input } from "@/components/ui/Input";
import { setRunStatus } from "@/app/actions/testRuns";

export function RunStatusActions({
  runId,
  projectId,
  status,
}: {
  runId: string;
  projectId: string;
  status: string;
}) {
  const [openAbort, setOpenAbort] = useState(false);

  const StatusButton = ({
    nextStatus,
    label,
    variant = "outline",
  }: {
    nextStatus: string;
    label: string;
    variant?: "primary" | "outline" | "ghost" | "secondary" | "danger";
  }) => (
    <form action={setRunStatus} className="inline">
      <input type="hidden" name="id" value={runId} />
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="status" value={nextStatus} />
      <Button type="submit" size="sm" variant={variant} data-testid={`run-${nextStatus}`}>
        {label}
      </Button>
    </form>
  );

  return (
    <div className="flex items-center gap-2">
      {status === "draft" || status === "in_progress" ? (
        <>
          {status === "draft" ? (
            <StatusButton nextStatus="in_progress" label="Start run" variant="primary" />
          ) : null}
          <StatusButton nextStatus="completed" label="Mark complete" />
          <StatusButton nextStatus="blocked" label="Block" />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpenAbort(true)}
            data-testid="run-abort-open"
          >
            Abort
          </Button>
        </>
      ) : (
        <span className="text-xs text-(--muted)">Run is {status.replace("_", " ")}.</span>
      )}
      <Dialog
        open={openAbort}
        onOpenChange={setOpenAbort}
        title="Abort run"
        description="Provide a reason. The run will be marked aborted."
      >
        <form
          action={async (fd) => {
            await setRunStatus(fd);
            setOpenAbort(false);
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="id" value={runId} />
          <input type="hidden" name="projectId" value={projectId} />
          <input type="hidden" name="status" value="aborted" />
          <Field label="Reason" htmlFor="abort-reason">
            <Input
              id="abort-reason"
              name="abortReason"
              placeholder="e.g. Build broken, restarting"
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpenAbort(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Abort
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
