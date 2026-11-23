/**
 * Sign in with a college ID card: scan its QR (camera), tap it (Web NFC or a USB reader,
 * which types into the focused field), or type the code printed under the QR.
 * Judges get four demo cards with real signed tokens and a "Tap card" button.
 */
import { useQuery } from "@tanstack/react-query";
import { Camera, Nfc, ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { Logo } from "../../components/Layout";
import { ErrorNote, Skeleton } from "../../components/ui";
import { homeFor } from "../../routes";

interface DemoCard {
  cardId: string;
  role: string;
  label: string;
  name: string;
  token: string;
  qrSvg: string;
  pin?: string;
}

const CARD_TONE: Record<string, string> = { student: "var(--yellow)", faculty: "var(--violet-tint)", technician: "var(--green-tint)", admin: "var(--orange-tint)" };

export default function SignIn() {
  const { signInWithCard } = useSession();
  const navigate = useNavigate();
  const [kiosk, setKiosk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const cards = useQuery({ queryKey: ["demo-cards"], queryFn: () => api<{ cards: DemoCard[] }>("/demo-cards"), staleTime: Infinity });

  const go = async (token: string, who: string) => {
    setBusy(who);
    setError(null);
    try {
      const user = await signInWithCard(token, kiosk);
      navigate(kiosk ? "/session" : homeFor(user.role), { replace: true });
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-dvh">
      <header className="max-w-6xl mx-auto px-4 h-16 flex items-center">
        <Logo />
      </header>
      <main id="main" className="max-w-6xl mx-auto px-4 pb-24">
        <section className="text-center py-12 sm:py-16" aria-labelledby="hero">
          <span className="hand block -rotate-3 mb-2" aria-hidden="true">↘ no lab chaos. no spreadsheets.</span>
          <h1 id="hero">
            Don't just <span className="hl">book</span> equipment.
            <br />
            Make your <span className="squiggle">project</span> possible.
          </h1>
          <p className="meta !text-base max-w-xl mx-auto mt-4">
            LabLink turns your idea into a feasible, fair lab plan across every department, keeps you safe while you work, and recovers your plan when the lab changes.
          </p>
        </section>

        <section aria-labelledby="cards-title" className="grid gap-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="cards-title">Tap your ID card</h2>
              <p className="meta mt-1">Pick a demo card. Each one is a real signed card token, checked by the same server path as a scanned card.</p>
            </div>
            <label className="inline-flex items-center gap-2 font-semibold text-sm min-h-11 cursor-pointer">
              <input type="checkbox" className="w-5 h-5 accent-[var(--ink-900)]" checked={kiosk} onChange={(e) => setKiosk(e.target.checked)} />
              Bench kiosk mode (2-minute session)
            </label>
          </div>
          <ErrorNote error={error} />
          <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 stagger" aria-busy={cards.isLoading}>
            {cards.isLoading && [0, 1, 2, 3].map((i) => <li key={i}><Skeleton className="aspect-[1.586]" /></li>)}
            {cards.data?.cards.map((c) => (
              <li key={c.cardId} className="grid gap-3">
                <div className="idcard" style={{ background: CARD_TONE[c.role] }}>
                  <p className="text-sm font-semibold">{c.label}</p>
                  <p className="font-display text-xl leading-tight mt-1">{c.name}</p>
                  <p className="mono mt-1 text-xs">{c.cardId}</p>
                  {c.pin && <p className="mono mt-1 text-xs">Staff PIN {c.pin}</p>}
                  <img
                    src={`data:image/svg+xml;utf8,${encodeURIComponent(c.qrSvg)}`}
                    alt={`QR code on ${c.name}'s demo card`}
                    className="absolute right-3 bottom-3 w-[34%] aspect-square bg-white rounded-lg p-1.5"
                  />
                </div>
                <button type="button" className="btn btn-primary" onClick={() => go(c.token, c.cardId)} disabled={Boolean(busy)} aria-label={`Tap card: sign in as ${c.name}, ${c.label}`}>
                  {busy === c.cardId ? "Signing in…" : "Tap card"}
                </button>
              </li>
            ))}
          </ul>
          {cards.error && <ErrorNote error={cards.error} />}
        </section>

        <section aria-labelledby="own-card" className="card mt-16 grid gap-6 md:grid-cols-2">
          <div>
            <h2 id="own-card" className="!text-2xl">Using your own card?</h2>
            <p className="meta mt-2">Scan the QR on your college ID, tap it on an NFC phone or reader, or type the code printed under the QR. Your card holds no personal data, only a signed number.</p>
          </div>
          <div className="grid gap-3">
            <CameraScan onToken={(t) => go(t, "scan")} />
            <NfcTap onToken={(t) => go(t, "nfc")} />
            <TypedToken onToken={(t) => go(t, "typed")} busy={busy === "typed"} />
          </div>
        </section>
      </main>
    </div>
  );
}

/** Camera QR scan: native BarcodeDetector where available, html5-qrcode otherwise (lazy-loaded). */
function CameraScan({ onToken }: { onToken: (t: string) => void }) {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const regionId = useId().replace(/:/g, "");
  const onTokenRef = useRef(onToken);
  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!on) return;
    let stop = () => {};
    let cancelled = false;
    (async () => {
      try {
        const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        if (Detector && videoRef.current) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          const video = videoRef.current;
          video.srcObject = stream;
          await video.play();
          const detector = new Detector({ formats: ["qr_code"] });
          const tick = async () => {
            if (cancelled) return;
            const codes = await detector.detect(video).catch(() => []);
            if (codes[0]?.rawValue.startsWith("LL1.")) {
              onTokenRef.current(codes[0].rawValue);
              setOn(false);
              return;
            }
            requestAnimationFrame(tick);
          };
          stop = () => stream.getTracks().forEach((t) => t.stop());
          void tick();
        } else {
          const { Html5Qrcode } = await import("html5-qrcode");
          const scanner = new Html5Qrcode(regionId);
          await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: 220 }, (text) => {
            if (text.startsWith("LL1.")) {
              onTokenRef.current(text);
              setOn(false);
            }
          }, () => {});
          stop = () => void scanner.stop().catch(() => {});
        }
      } catch (e) {
        setError(errorMessage(e).includes("Permission") ? "Camera permission was denied. Use another option below." : "Couldn't start the camera on this device.");
        setOn(false);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [on, regionId]);

  return (
    <div className="grid gap-2">
      <button type="button" className="btn btn-soft" onClick={() => setOn((v) => !v)} aria-expanded={on}>
        <Camera size={18} aria-hidden="true" /> {on ? "Stop camera" : "Scan the QR on my ID"}
      </button>
      {on && (
        <div className="rounded-2xl overflow-hidden bg-subtle">
          <video ref={videoRef} className="w-full" muted playsInline aria-label="Camera preview for scanning your ID" />
          <div id={regionId} />
        </div>
      )}
      {error && <p className="meta" role="alert">{error}</p>}
    </div>
  );
}

/** Web NFC (Chrome on Android). Hidden where unsupported. */
function NfcTap({ onToken }: { onToken: (t: string) => void }) {
  const supported = typeof window !== "undefined" && "NDEFReader" in window;
  const [listening, setListening] = useState(false);
  if (!supported) return null;
  const start = async () => {
    try {
      const Reader = (window as unknown as { NDEFReader: new () => { scan: () => Promise<void>; onreading: (e: { message: { records: { recordType: string; data: DataView }[] } }) => void } }).NDEFReader;
      const reader = new Reader();
      await reader.scan();
      setListening(true);
      reader.onreading = (e) => {
        const rec = e.message.records.find((r) => r.recordType === "text");
        // NDEF text record: status byte (language-code length in the low 6 bits), language, then text.
        if (rec) onToken(new TextDecoder().decode(new DataView(rec.data.buffer, rec.data.byteOffset + 1 + (rec.data.getUint8(0) & 0x3f))));
      };
    } catch {
      setListening(false);
    }
  };
  return (
    <button type="button" className="btn btn-soft" onClick={start} aria-pressed={listening}>
      <Nfc size={18} aria-hidden="true" /> {listening ? "Hold your ID to the back of the phone…" : "Tap my ID (NFC)"}
    </button>
  );
}

/** Typed fallback. USB card readers act as keyboards and "type" the token here too. */
function TypedToken({ onToken, busy }: { onToken: (t: string) => void; busy: boolean }) {
  const [value, setValue] = useState("");
  const id = useId();
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onToken(value.trim());
      }}
    >
      <label htmlFor={id} className="label">
        Card code (or use a USB card reader)
      </label>
      <div className="flex gap-2">
        <input id={id} className="input mono" value={value} onChange={(e) => setValue(e.target.value)} placeholder="LL1.STU-0001.1.…" autoComplete="off" spellCheck={false} />
        <button className="btn btn-primary" disabled={busy || !value.trim()} aria-label="Sign in with card code">
          <ScanLine size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
