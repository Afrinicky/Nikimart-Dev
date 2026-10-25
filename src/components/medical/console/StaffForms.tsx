"use client";

import { UserPlus } from "lucide-react";
import { ActionForm } from "@/components/medical/console/ActionForm";
import { Field, Select, TextArea, TextInput } from "@/components/medical/console/Field";
import {
  changeStaffRole,
  grantStaffAccess,
  setStaffActive,
} from "@/lib/medical/admin/staff-actions";
import { MEDICAL_ROLES, MEDICAL_ROLE_DESCRIPTIONS, MEDICAL_ROLE_LABELS } from "@/lib/medical/roles";

/**
 * Granting console access.
 *
 * An email rather than a name, because this grants a role to an account that
 * already exists: identity is one Nickimart account across the three
 * businesses, so there is no password to set and no invitation to send. Typing
 * a name here would create a record that may belong to nobody, and the console
 * would then list a colleague who cannot sign in.
 */
export function GrantAccessForm() {
  return (
    <ActionForm
      action={grantStaffAccess}
      submitLabel="Grant access"
      pendingLabel="Granting…"
      successMessage="Access granted."
      className="medi-panel medi-panel-lg p-5 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="The email they sign in with"
          htmlFor="email"
          required
          hint="They must already have a Nickimart account."
        >
          <TextInput id="email" type="email" required placeholder="name@hospital.org" />
        </Field>
        <Field label="Role" htmlFor="role" required hint={MEDICAL_ROLE_DESCRIPTIONS.SALES}>
          <Select id="role" required defaultValue="SALES">
            {MEDICAL_ROLES.map((role) => (
              <option key={role} value={role}>
                {MEDICAL_ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <p className="medi-meta mt-4 flex items-start gap-2 rounded-xl bg-medi-mint-50 px-3.5 py-3 text-medi-teal-800">
        <UserPlus className="mt-px h-4 w-4 shrink-0" aria-hidden />
        <span>
          This grants a role; it does not create a login. A colleague registers at nickimart.com
          like any other customer, and being a customer there gives them nothing here.
        </span>
      </p>
    </ActionForm>
  );
}

/** Change one person's role, inline on their row. */
export function RoleForm({
  staffId,
  role,
  name,
}: {
  staffId: string;
  role: string;
  name: string;
}) {
  return (
    <ActionForm
      action={changeStaffRole}
      submitLabel="Change role"
      pendingLabel="Changing…"
      variant="secondary"
      successMessage="Role changed."
      className="min-w-0"
    >
      <input type="hidden" name="staffId" value={staffId} />
      <Field label={`Role for ${name}`} htmlFor={`role-${staffId}`}>
        <Select id={`role-${staffId}`} name="role" defaultValue={role}>
          {MEDICAL_ROLES.map((r) => (
            <option key={r} value={r}>
              {MEDICAL_ROLE_LABELS[r]}
            </option>
          ))}
        </Select>
      </Field>
    </ActionForm>
  );
}

/**
 * Suspend or reinstate.
 *
 * Suspension needs a reason and keeps the record: every audit entry, stock
 * movement and issued quotation points at this row, and deleting it would
 * leave the record of their work unattributable.
 */
export function AccessForm({
  staffId,
  active,
  name,
  isSelf,
}: {
  staffId: string;
  active: boolean;
  name: string;
  isSelf: boolean;
}) {
  if (isSelf) {
    return (
      <p className="medi-meta text-medi-muted">
        This is you. Somebody else has to change your access.
      </p>
    );
  }

  return (
    <ActionForm
      action={setStaffActive}
      submitLabel={active ? "Suspend access" : "Reinstate access"}
      pendingLabel="Saving…"
      variant={active ? "danger" : "secondary"}
      successMessage={active ? "Access suspended." : "Access reinstated."}
      className="min-w-0"
    >
      <input type="hidden" name="staffId" value={staffId} />
      <input type="hidden" name="active" value={active ? "0" : "1"} />
      {active ? (
        <Field
          label={`Why is ${name} being suspended?`}
          htmlFor={`note-${staffId}`}
          hint="Kept on their record. They lose access on their next page load."
        >
          <TextArea id={`note-${staffId}`} name="note" rows={2} required />
        </Field>
      ) : (
        <p className="medi-meta text-medi-body">
          They will be able to sign in to the console again immediately.
        </p>
      )}
    </ActionForm>
  );
}
