import {
  Activity,
  Beaker,
  Bandage,
  Boxes,
  Droplets,
  FlaskConical,
  HeartPulse,
  Microscope,
  Package,
  Pipette,
  Ruler,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TestTubes,
  Thermometer,
  type LucideIcon,
} from "lucide-react";

/**
 * Category icons, by name.
 *
 * The icon is a string column so an administrator can change it without a
 * deploy, which means the value is whatever somebody typed. Resolved through a
 * fixed map rather than a dynamic import: a typo falls back to a box instead
 * of crashing the sidebar, and the bundle contains these seventeen icons
 * rather than the whole of lucide.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  Beaker,
  Bandage,
  Boxes,
  Droplets,
  FlaskConical,
  HeartPulse,
  Microscope,
  Package,
  Pipette,
  Ruler,
  Scissors,
  ShieldCheck,
  Stethoscope,
  Syringe,
  TestTubes,
  Thermometer,
};

export function categoryIcon(name: string): LucideIcon {
  return ICONS[name] ?? Package;
}

export const ICON_NAMES = Object.keys(ICONS);
