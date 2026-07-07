import { useEffect, useState } from "react";
import { getConfig, type PublicConfig } from "../lib/api";
import TagForm from "../components/TagForm";

/**
 * Hidden sandbox: the exact checkout flow, but submitting runs a no-payment
 * simulation (creates a paid test order and dispatches it) so you can test the
 * order → PDF → Telegram → email pipeline without Stripe.
 */
export default function Qwertyuiop() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(null));
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <div className="mb-8 max-w-xl animate-riseIn">
        <span className="eyebrow">
          <span className="h-1.5 w-1.5 rounded-full bg-reg" /> Sandbox
        </span>
        <h1 className="mt-3 font-display text-3xl font-700 tracking-tight text-ink sm:text-4xl">
          Sandbox &amp; simulations
        </h1>
        <p className="mt-2 text-slate">
          Same form as checkout, but submitting <b>skips payment</b> — it creates a
          test order and runs the real dispatch pipeline so you can verify the
          plate PDF, driver Accept/Decline, and emails end to end.
        </p>
      </div>
      <TagForm config={config} sandbox />
    </div>
  );
}
