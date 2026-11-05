"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useT } from "@/i18n/client";

type Field = { name: string; placeholder: string; mono?: boolean; options?: { value: string; label: string }[]; width?: string };

/** Small inline form that POSTs {...extra, ...fields} and shows the JSON `message` (if any). */
export function PostForm({ url, extra, fields, submitLabel }: { url: string; extra?: Record<string, unknown>; fields: Field[]; submitLabel: string }) {
  const router = useRouter();
  const t = useT();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, f.options?.[0]?.value ?? ""])));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <form
      className="flex flex-wrap items-start gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setMsg(null);
        try {
          const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...extra, ...values }) });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          if (data.message) setMsg({ ok: true, text: t(data.message) });
          setValues(Object.fromEntries(fields.map((f) => [f.name, f.options?.[0]?.value ?? ""])));
          router.refresh();
        } catch (err) {
          setMsg({ ok: false, text: t((err as Error).message) });
        } finally {
          setBusy(false);
        }
      }}
    >
      {fields.map((f) =>
        f.options ? (
          <select key={f.name} className={`input ${f.width ?? "w-40"}`} value={values[f.name]} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        ) : (
          <input
            key={f.name}
            className={`input ${f.mono ? "mono" : ""} ${f.width ?? "flex-1 min-w-48"}`}
            placeholder={f.placeholder}
            value={values[f.name]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          />
        ),
      )}
      <button className="btn-primary" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {submitLabel}
      </button>
      {msg && <p className={`basis-full text-sm ${msg.ok ? "text-slate-700" : "text-rose-600"}`}>{msg.text}</p>}
    </form>
  );
}
