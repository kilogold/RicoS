import { CartBar, MenuBoard } from "@/components/menu-board";
import { MENU } from "@ricos/shared";

export default function Home() {
  return (
    <main className="relative pb-32">
      <div className="border-b border-white/10 bg-gradient-to-br from-[#0c2340] via-[#0a1f38] to-[#07182b] px-4 py-12 md:px-10">
        <div className="mx-auto max-w-4xl">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-[#f4c430]">
            RicoS
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tracking-tight text-white md:text-5xl">
            {MENU.menuName}
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-white/75">
            Order online for pickup. Pay securely with your card — no account
            needed.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 md:px-6">
        <MenuBoard categories={MENU.categories} />
      </div>

      <CartBar />
    </main>
  );
}
