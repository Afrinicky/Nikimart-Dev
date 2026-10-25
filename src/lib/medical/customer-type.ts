/**
 * What kind of customer somebody is, in their own words.
 *
 * Asked once, on the quotation form, and it decides two things: which fields
 * the form asks for (an individual has no institution name) and how the
 * request is routed when it arrives. It is not a credential — nobody is
 * verified by picking "Hospital" from a list — and nothing in the system may
 * treat it as one.
 */
export const CUSTOMER_TYPES = [
  "HOSPITAL",
  "LABORATORY",
  "CLINIC",
  "PHARMACY",
  "RESEARCH",
  "ACADEMIC",
  "GOVERNMENT",
  "NGO",
  "DISTRIBUTOR",
  "INDIVIDUAL",
  "OTHER",
] as const;

export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export const CUSTOMER_TYPE_LABELS: Record<CustomerType, string> = {
  HOSPITAL: "Hospital",
  LABORATORY: "Laboratory",
  CLINIC: "Clinic",
  PHARMACY: "Pharmacy",
  RESEARCH: "Research institute",
  ACADEMIC: "University or school",
  GOVERNMENT: "Government or agency",
  NGO: "NGO or mission",
  DISTRIBUTOR: "Distributor or reseller",
  INDIVIDUAL: "Individual",
  OTHER: "Something else",
};

export function isCustomerType(value: unknown): value is CustomerType {
  return typeof value === "string" && (CUSTOMER_TYPES as readonly string[]).includes(value);
}

/** Whether this kind of customer is asked for an institution name. */
export function needsInstitution(type: CustomerType): boolean {
  return type !== "INDIVIDUAL" && type !== "OTHER";
}
