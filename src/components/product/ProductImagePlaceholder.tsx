import { cn } from "@/lib/cn";

export function ProductImagePlaceholder({
  gradientFrom,
  gradientTo,
  emoji,
  className,
}: {
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden",
        className,
      )}
      style={{
        background: `linear-gradient(135deg, ${gradientFrom} 0%, ${gradientTo} 100%)`,
      }}
    >
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "radial-gradient(circle at 25% 25%, rgba(255,255,255,0.5) 0, transparent 35%)",
        }}
      />
      <span className="relative text-4xl drop-shadow-sm sm:text-5xl" aria-hidden>
        {emoji}
      </span>
    </div>
  );
}
