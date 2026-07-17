// Origin countries for sellers/products. "GH" is local; anything else ships
// from abroad. regionId matches the ids used in global-data's sourceRegions and
// the /global-shopping/[region] route.

export interface CountryInfo {
  code: string; // GH, CN, AE, US, EU
  name: string;
  flag: string;
  regionId: string; // ghana, china, dubai, usa, europe
  defaultLeadDays: number; // typical days to arrive in Ghana
}

export const COUNTRIES: CountryInfo[] = [
  { code: "GH", name: "Ghana", flag: "🇬🇭", regionId: "ghana", defaultLeadDays: 0 },
  { code: "CN", name: "China", flag: "🇨🇳", regionId: "china", defaultLeadDays: 21 },
  { code: "AE", name: "Dubai / UAE", flag: "🇦🇪", regionId: "dubai", defaultLeadDays: 14 },
  { code: "US", name: "USA", flag: "🇺🇸", regionId: "usa", defaultLeadDays: 21 },
  { code: "EU", name: "Europe", flag: "🇪🇺", regionId: "europe", defaultLeadDays: 21 },
];

export const FOREIGN_COUNTRIES = COUNTRIES.filter((c) => c.code !== "GH");

export function isAbroad(code: string | undefined | null): boolean {
  return Boolean(code) && code !== "GH";
}

export function countryByCode(code: string | undefined | null): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.code === code);
}

export function countryByRegion(regionId: string): CountryInfo | undefined {
  return COUNTRIES.find((c) => c.regionId === regionId);
}

/** Format an estimated arrival date `leadDays` from `from`. */
export function estimatedArrival(leadDays: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + leadDays * 24 * 60 * 60 * 1000);
}
