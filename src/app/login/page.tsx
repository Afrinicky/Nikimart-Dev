import Link from "next/link";

export const metadata = {
  title: "Login | NikiMart",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-3xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="w-full rounded-3xl border border-white/10 bg-niki-surface/95 p-8 shadow-xl shadow-black/10 backdrop-blur-xl sm:p-12">
        <h1 className="text-3xl font-bold text-white sm:text-4xl">Login to NikiMart</h1>
        <p className="mt-4 text-sm text-niki-slate-300 sm:text-base">
          Welcome back! Please sign in to view your account, orders, and saved items.
        </p>

        <div className="mt-10 grid gap-4">
          <button
            type="button"
            className="rounded-2xl bg-niki-orange px-5 py-3 text-sm font-semibold text-niki-navy transition hover:bg-orange-400"
          >
            Continue with Email
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20"
          >
            Continue with Google
          </button>
          <button
            type="button"
            className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:border-white/20"
          >
            Continue with Apple
          </button>
        </div>

        <p className="mt-8 text-sm text-niki-slate-400">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="font-semibold text-white hover:text-niki-orange">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
