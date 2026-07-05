import { cn } from "@/lib/cn";

export function ProductImagePlaceholder({
  gradientFrom,
  gradientTo,
  emoji,
  imageUrl,
  alt,
  className,
}: {
  gradientFrom: string;
  gradientTo: string;
  emoji: string;
  imageUrl?: string;
  alt?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-white",
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

      {/*
        The real photo is layered over the gradient + emoji. If the image is
        missing (404), this background simply doesn't paint and the emoji
        placeholder shows through — no broken-image icons, no client JS.
      */}
      {imageUrl ? (
        <span
          role="img"
          aria-label={alt}
          className="absolute inset-0 bg-white bg-cover bg-center"
          style={{ backgroundImage: `url("${imageUrl}")` }}
        />
      ) : null}
    </div>
  );
}
