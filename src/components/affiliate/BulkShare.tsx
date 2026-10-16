"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import {
  CheckCheck,
  ImageIcon,
  LayoutTemplate,
  Loader2,
  MessageCircle,
  Plus,
  X,
} from "lucide-react";
import {
  MAX_BULK_SHARE,
  batchShareText,
  flyerFileName,
  productFlyerShareText,
  type FlyerDesign,
  type ProductFlyerData,
} from "@/lib/affiliate-flyer";
import { photoFileName, type WatermarkConfig } from "@/lib/affiliate-watermark";
import {
  buildShareFile,
  loadShareImage,
  saveBlob,
  type ShareMode,
} from "@/components/affiliate/share-canvas";
import {
  addPromotedProduct,
  ensurePromotedProducts,
  recordBulkShare,
} from "@/lib/affiliate-console-actions";
import { cn } from "@/lib/cn";

/**
 * Sharing several products at once.
 *
 * An affiliate posting to a status rarely posts one thing, so this gathers a
 * selection as somebody browses, mints a link for anything not already on
 * their list, builds every image, and hands the lot to the share sheet in one
 * go. One tap, every product.
 *
 * What makes that safe is where each product's link lives. A share sheet takes
 * many files and exactly one message, so anything product-specific in that
 * message lands under every picture — which is how product A's status came to
 * carry product B's link. The message now names no product at all, and each
 * picture carries its own: the flyer prints the link and the caption on itself,
 * and a photograph, which is deliberately unlettered, gets its link stamped
 * under the watermark when it travels in a batch.
 *
 * A single product keeps the message it always had. There is no other picture
 * for it to be wrong about.
 *
 * The selection lives in React rather than the query string on purpose: it is
 * a scratch pad, not an address, and a link that restores somebody else's
 * half-made selection would be worse than one that does not.
 */

export interface SelectableProduct {
  id: string;
  name: string;
  price: string;
  oldPrice: string | null;
  discount: string | null;
  image: string | null;
  emoji: string;
  gradientFrom: string;
  gradientTo: string;
  shopName: string;
  categoryName: string;
  /** Their link for it, when it is already on their list. */
  linkCode: string | null;
  eligible: boolean;
}

interface SelectionValue {
  selected: Map<string, SelectableProduct>;
  toggle: (product: SelectableProduct) => void;
  clear: () => void;
  isSelected: (id: string) => boolean;
  full: boolean;
}

const SelectionContext = createContext<SelectionValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Map<string, SelectableProduct>>(new Map());

  const toggle = useCallback((product: SelectableProduct) => {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(product.id)) next.delete(product.id);
      else if (next.size < MAX_BULK_SHARE) next.set(product.id, product);
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Map()), []);

  const value = useMemo<SelectionValue>(
    () => ({
      selected,
      toggle,
      clear,
      isSelected: (id: string) => selected.has(id),
      full: selected.size >= MAX_BULK_SHARE,
    }),
    [selected, toggle, clear],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

function useSelection(): SelectionValue | null {
  return useContext(SelectionContext);
}

/**
 * The tick on a card or a row.
 *
 * Renders nothing outside a selection — the same card is used on screens where
 * bulk sharing makes no sense, and a checkbox that does nothing is worse than
 * no checkbox.
 */
export function SelectBox({
  product,
  className,
}: {
  product: SelectableProduct;
  className?: string;
}) {
  const selection = useSelection();
  if (!selection) return null;

  const checked = selection.isSelected(product.id);
  const blocked = !checked && selection.full;

  return (
    <label
      className={cn(
        "niki-focus inline-flex cursor-pointer items-center justify-center",
        blocked && "cursor-not-allowed opacity-40",
        className,
      )}
      title={
        blocked ? `You can share ${MAX_BULK_SHARE} at a time` : checked ? "Selected" : "Select"
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={blocked}
        onChange={() => selection.toggle(product)}
        aria-label={`Select ${product.name}`}
        className="h-4 w-4 accent-niki-orange"
      />
    </label>
  );
}

/**
 * The bar that appears once something is selected.
 *
 * Fixed to the bottom, above the phone's tab bar, because the selection is
 * made while scrolling and the action has to be reachable without scrolling
 * back. It leaves the page alone until there is something to do.
 */
export function BulkShareBar({
  design,
  watermark,
  logoUrl,
  linkBase,
  caption,
  storeLink,
  suspended = false,
}: {
  design: FlyerDesign;
  watermark: WatermarkConfig;
  logoUrl: string;
  /** Where a link code becomes a link: "https://…/r". */
  linkBase: string;
  /** The affiliate's default caption. */
  caption: string;
  /** Their store-wide link, for the fallback message. */
  storeLink: string;
  suspended?: boolean;
}) {
  const selection = useSelection();
  const [mode, setMode] = useState<ShareMode>("flyer");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();

  if (!selection || selection.selected.size === 0) return null;

  // Captured after the guard: the closures below outlive this render, and
  // TypeScript will not carry the narrowing into them.
  const picks = selection;
  const products = [...picks.selected.values()];
  const count = products.length;

  function pieceFor(
    product: SelectableProduct,
    link: string,
    image: Awaited<ReturnType<typeof loadShareImage>>,
    logo: Awaited<ReturnType<typeof loadShareImage>>,
  ) {
    const data: ProductFlyerData = {
      name: product.name,
      price: product.price,
      oldPrice: product.oldPrice,
      discount: product.discount,
      shopName: product.shopName,
      categoryName: product.categoryName,
      message: caption,
      link: link.replace(/^https?:\/\//, ""),
      sharedBy: "",
      emoji: product.emoji,
      gradientFrom: product.gradientFrom,
      gradientTo: product.gradientTo,
    };
    return { data, design, watermark, image, logo };
  }

  /**
   * Build every picture and hand the lot over in one share sheet.
   *
   * One tap, one sheet, every product — which is what posting a set of status
   * updates should cost. What makes that safe is that nothing product-specific
   * rides in the message: a share sheet carries one message for every file in
   * it, so a name or a link in there would land under all of them, and product
   * A's post would carry product B's link.
   *
   * So each picture carries its own. The flyer prints the link and the caption
   * on itself already; a photograph gets its link stamped under the watermark
   * for a batch, because the message cannot say it per picture. The message
   * that goes with the batch names no product at all.
   */
  async function shareAll() {
    setBusy(true);
    setNote(null);

    try {
      // Every selected product gets a link of its own, minting one for
      // anything not already on the list — the whole point of sharing them is
      // that the sales come back to this affiliate.
      const codes: Record<string, string> = await ensurePromotedProducts(
        products.map((p) => p.id),
      ).catch(() => ({}));
      const logo = watermark.logo.enabled && logoUrl ? await loadShareImage(logoUrl) : null;

      const files: File[] = [];
      const saved: { blob: Blob; name: string }[] = [];
      const batch = products.length > 1;

      for (const product of products) {
        const code = codes[product.id] ?? product.linkCode;
        const link = code ? `${linkBase}/${code}` : storeLink;

        const image = await loadShareImage(product.image);
        const piece = { ...pieceFor(product, link, image, logo), stampLink: batch };
        const fileName =
          mode === "flyer" ? flyerFileName(product.name) : photoFileName(product.name);

        const file = await buildShareFile(mode, piece, fileName);
        if (file) {
          files.push(file);
          saved.push({ blob: file, name: fileName });
        }
      }

      if (files.length === 0) {
        setNote("Couldn't build the images. Try a few at a time.");
        setBusy(false);
        return;
      }

      // One product on its own keeps the message it has always had: there is
      // no other picture for it to be wrong about.
      const text = batch
        ? batchShareText(caption)
        : productFlyerShareText({
            productName: products[0].name,
            price: products[0].price,
            shopName: products[0].shopName,
            link: codes[products[0].id] ?? products[0].linkCode
              ? `${linkBase}/${codes[products[0].id] ?? products[0].linkCode}`
              : storeLink,
            template: caption,
          });

      const payload = { files, text, title: batch ? `${files.length} picks from Nickimart` : products[0].name };
      if (typeof navigator !== "undefined" && "canShare" in navigator && navigator.canShare?.(payload)) {
        await navigator.share(payload);
        void recordBulkShare(products.map((p) => p.id)).catch(() => {});
        picks.clear();
        setNote(null);
        setBusy(false);
        return;
      }

      // No file sharing here: save every image and open WhatsApp with the
      // message, which is the two steps a desktop browser can manage. The
      // links are on the pictures either way.
      for (const item of saved) saveBlob(item.blob, item.name);
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      void recordBulkShare(products.map((p) => p.id)).catch(() => {});
      setNote(
        `${saved.length} ${saved.length === 1 ? "image" : "images"} saved — attach them to the WhatsApp message that just opened.`,
      );
    } catch (err) {
      // A cancelled share is not a failure.
      if ((err as Error)?.name !== "AbortError") {
        setNote("Couldn't build the images. Try a few at a time.");
      }
    }
    setBusy(false);
  }

  function addAll() {
    startAdding(async () => {
      for (const product of products) {
        if (product.linkCode) continue;
        const fd = new FormData();
        fd.set("productId", product.id);
        fd.set("from", window.location.pathname);
        await addPromotedProduct(fd);
      }
      picks.clear();
    });
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-24 lg:pb-6">
      <div className="pointer-events-auto animate-fade-up mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl bg-niki-black p-2.5 text-white shadow-xl shadow-niki-black/20 ring-1 ring-white/10">
        <span className="flex items-center gap-2 px-1.5">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-niki-orange px-1.5 text-xs font-bold">
            {count}
          </span>
          <span className="text-xs font-semibold text-white/80">
            selected
            {picks.full ? (
              <span className="ml-1 text-white/40">(max {MAX_BULK_SHARE})</span>
            ) : null}
          </span>
        </span>

        {/* Which picture they get. The same choice the share studio offers. */}
        <div className="ml-auto flex rounded-xl bg-white/10 p-0.5">
          {(
            [
              { key: "flyer", label: "Flyer", icon: LayoutTemplate },
              { key: "photo", label: "Photo", icon: ImageIcon },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setMode(option.key)}
              aria-pressed={mode === option.key}
              className={cn(
                "niki-press niki-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition-colors",
                mode === option.key ? "bg-white text-niki-ink" : "text-white/60 hover:text-white",
              )}
            >
              <option.icon className="h-3 w-3" />
              {option.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={addAll}
          disabled={adding || busy}
          title="Add every selected product to your list"
          className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-white/80 ring-1 ring-white/20 hover:bg-white/10 disabled:opacity-50"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add all
        </button>

        <button
          type="button"
          onClick={shareAll}
          disabled={busy || suspended}
          title={suspended ? "Your account is on hold" : undefined}
          className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-xl bg-niki-success px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MessageCircle className="h-3.5 w-3.5" />
          )}
          Share all {count}
        </button>

        <button
          type="button"
          onClick={() => {
            picks.clear();
            setNote(null);
          }}
          aria-label="Clear the selection"
          className="niki-press niki-focus rounded-xl p-2 text-white/55 ring-1 ring-white/15 hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {note ? (
          <p className="w-full rounded-xl bg-white/10 px-3 py-2 text-[11px] leading-relaxed text-white/75">
            {note}
          </p>
        ) : count > 1 ? (
          <p className="w-full px-1 text-[11px] leading-relaxed text-white/45">
            All {count} go out together, and each picture carries its own link —
            {mode === "flyer" ? " printed on the flyer" : " under the watermark"} — so no post
            sends buyers to the wrong product.
          </p>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Select everything on this page at once.
 *
 * Sits above a list rather than in the bar, because it belongs to what is on
 * screen: "all" means the rows you can see, not every product in the
 * catalogue, and putting it beside them is what makes that obvious.
 */
export function SelectAll({ products }: { products: SelectableProduct[] }) {
  const selection = useSelection();
  if (!selection || products.length === 0) return null;

  const room = products.slice(0, MAX_BULK_SHARE);
  const allSelected = room.every((p) => selection.isSelected(p.id));

  return (
    <button
      type="button"
      onClick={() => {
        if (allSelected) selection.clear();
        else {
          for (const product of room) {
            if (!selection.isSelected(product.id)) selection.toggle(product);
          }
        }
      }}
      className="niki-press niki-focus inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-niki-ink/70 ring-1 ring-niki-edge hover:bg-niki-black/5"
    >
      <CheckCheck className="h-3.5 w-3.5" />
      {allSelected ? "Clear selection" : `Select ${Math.min(room.length, MAX_BULK_SHARE)}`}
    </button>
  );
}
