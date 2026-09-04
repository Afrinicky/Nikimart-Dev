import { permanentRedirect } from "next/navigation";

/**
 * "From abroad" is now the forwarders themselves.
 *
 * The screen used to be a list of forwarders plus a set of platform-wide duty,
 * tax and lead-time settings sitting on top of their quotes. Those settings are
 * gone — a forwarder's rate per cubic metre is the whole cost of the leg — so
 * what is left is the companies, and they are listed under their own name.
 */
export default function RetiredAbroadPage(): never {
  permanentRedirect("/admin/shipping/forwarders");
}
