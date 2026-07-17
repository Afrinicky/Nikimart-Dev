"use client";

import Link from "next/link";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { useCart } from "@/components/providers/CartProvider";
import { formatPrice } from "@/lib/format";

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem, ready } = useCart();

  return (
    <>
      <PageHeader title="Your Cart" crumbs={[{ label: "Cart" }]} />
      <Container className="py-8">
        {!ready ? (
          <div className="rounded-2xl bg-white p-10 text-center text-sm text-niki-ink/50 ring-1 ring-black/5">
            Loading your cart…
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ShoppingCart className="h-6 w-6" />}
            title="Your cart is empty"
            message="Browse NikiMart and add products, preorders, or services to your cart."
            actionLabel="Start shopping"
            actionHref="/products"
          />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.productId} className="flex items-center gap-4 rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div
                    className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-cover bg-center text-2xl"
                    style={
                      item.image
                        ? { backgroundImage: `url(${item.image})` }
                        : { background: `linear-gradient(135deg, ${item.gradientFrom}, ${item.gradientTo})` }
                    }
                  >
                    {item.image ? "" : item.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${item.slug}`} className="line-clamp-1 font-semibold text-niki-ink hover:text-niki-orange">
                      {item.name}
                    </Link>
                    <p className="mt-0.5 text-sm text-niki-ink/60">{formatPrice(item.price)}</p>
                  </div>
                  <div className="flex items-center gap-1 rounded-full bg-niki-surface p-1">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-niki-ink/70 transition-colors hover:bg-white"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold text-niki-ink">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-niki-ink/70 transition-colors hover:bg-white"
                      aria-label="Increase quantity"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="w-20 text-right font-display font-bold text-niki-ink">
                    {formatPrice(item.price * item.quantity)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.productId)}
                    className="rounded-lg p-2 text-niki-ink/40 transition-colors hover:bg-niki-danger/10 hover:text-niki-danger"
                    aria-label="Remove item"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            <aside className="h-fit rounded-2xl bg-white p-6 ring-1 ring-black/5">
              <h2 className="font-display text-lg font-bold text-niki-ink">Order summary</h2>
              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between text-niki-ink/70">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-niki-ink">{formatPrice(subtotal)}</dd>
                </div>
                <div className="flex justify-between text-niki-ink/70">
                  <dt>Delivery</dt>
                  <dd className="text-niki-ink/50">Calculated at checkout</dd>
                </div>
              </dl>
              <Link
                href="/checkout"
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-niki-orange px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-niki-orange-light"
              >
                Proceed to checkout
              </Link>
              <Link href="/products" className="mt-3 block text-center text-sm font-medium text-niki-ink/60 hover:text-niki-ink">
                Continue shopping
              </Link>
            </aside>
          </div>
        )}
      </Container>
    </>
  );
}
