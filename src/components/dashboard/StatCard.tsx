export function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-white p-5 ring-1 ring-black/5">
      <p className="font-display text-2xl font-bold text-niki-ink">{value}</p>
      <p className="mt-1 text-sm text-niki-ink/60">{label}</p>
    </div>
  );
}
