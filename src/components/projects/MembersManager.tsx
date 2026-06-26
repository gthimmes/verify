"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input, Select, Field } from "@/components/ui/Input";
import { Card, CardHeader, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { addMember, changeMemberRole, removeMember } from "@/app/actions/members";
import type { ProjectMember } from "@/lib/api";

const ROLES = ["admin", "editor", "viewer"] as const;

function roleHint(role: string) {
  switch (role) {
    case "admin":
      return "Full control: settings, members, and content.";
    case "editor":
      return "Can author cases and execute runs.";
    default:
      return "Read-only access.";
  }
}

export function MembersManager({
  projectId,
  members,
}: {
  projectId: string;
  members: ProjectMember[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | undefined>();
  const [pending, start] = useTransition();

  function add(formData: FormData) {
    setError(undefined);
    start(async () => {
      const res = await addMember({ ok: true }, formData);
      if (res.ok) {
        // Clear the email field by refreshing server data + form reset.
        (document.getElementById("member-email") as HTMLInputElement | null)?.form?.reset();
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  function changeRole(userId: string, role: string) {
    setError(undefined);
    start(async () => {
      const res = await changeMemberRole(projectId, userId, role);
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  function remove(userId: string) {
    setError(undefined);
    start(async () => {
      const res = await removeMember(projectId, userId);
      if (res.ok) router.refresh();
      else setError(res.message);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Add a member"
          description="Invite by email. People are added even before their first sign-in."
        />
        <CardBody>
          <form
            action={add}
            className="flex flex-wrap items-end gap-3"
            data-testid="add-member-form"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Field label="Email" htmlFor="member-email" className="min-w-[260px] flex-1">
              <Input
                id="member-email"
                name="email"
                type="email"
                required
                placeholder="teammate@company.com"
                data-testid="member-email"
              />
            </Field>
            <Field label="Role" htmlFor="member-role">
              <Select id="member-role" name="role" defaultValue="editor" data-testid="member-role">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" disabled={pending} data-testid="member-add">
              {pending ? "Adding…" : "Add member"}
            </Button>
          </form>
          {error ? (
            <div
              role="alert"
              className="mt-3 rounded-md bg-(--danger-soft) px-3 py-2 text-xs text-(--danger)"
            >
              {error}
            </div>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={`Members (${members.length})`} />
        <CardBody>
          <ul className="flex flex-col divide-y divide-(--border)">
            {members.map((m) => (
              <li
                key={m.userId}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                data-testid="member-row"
                data-email={m.email}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{m.name}</span>
                    {m.isOwner ? <Badge tone="default">owner</Badge> : null}
                  </div>
                  <p className="truncate text-sm text-(--muted)">{m.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <Select
                      value={m.role}
                      onChange={(e) => changeRole(m.userId, e.target.value)}
                      disabled={pending || m.isOwner}
                      className="h-8 w-28 text-xs"
                      data-testid="member-role-select"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </Select>
                    <span className="mt-1 max-w-[200px] text-right text-[11px] text-(--muted)">
                      {roleHint(m.role)}
                    </span>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || m.isOwner}
                    onClick={() => remove(m.userId)}
                    data-testid="member-remove"
                  >
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
