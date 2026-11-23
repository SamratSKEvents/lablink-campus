/**
 * Sign in with a college ID card: scan its QR (camera), tap it (Web NFC or a USB reader,
 * which types into the focused field), or type the code printed under the QR.
 * Judges pick one of four demo cards from a card stack; each holds a real signed token.
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Nfc, ScanLine } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../../lib/api";
import { useSession } from "../../lib/auth";
import { Logo } from "../../components/Layout";
import { ErrorNote, Skeleton, Spinner } from "../../components/ui";
import { Spark, Squiggle } from "../../components/Doodles";
import { Illustration } from "../../components/Illustration";
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

const CARD_TONE: Record<string, string> = {
  student: "var(--yellow)",
  faculty: "#d9ccff",
  technician: "#bff0d8",
  admin: "#ffd0b0",
};
const ROLE_BLURB: Record<string, string> = {
  student: "Plan a project, book it, and work at the bench.",
  faculty: "Approve requests with a copilot, and check fairness.",
  technician: "Run the labs: equipment status, certifications, alerts.",
  admin: "See utilisation and fairness, and run Finals Week.",
};

export default function SignIn() {
  const { signInWithCard } = useSession();
  const navigate = useNavigate();
  const [kiosk, setKiosk] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [active, setActive] = useState(0);
  const cards = useQuery({
    queryKey: ["demo-cards"],
    queryFn: () => api<{ cards: DemoCard[] }>("/demo-cards"),
    staleTime: Infinity,
  });
  const list = cards.data?.cards ?? [];
  const current = list[active];

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
    <div className="min-h-dvh overflow-x-hidden">
      <header className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="rounded-lg">
          <Logo />
        </Link>
        <Link to="/" className="btn-ghost">
          <ArrowLeft size={18} aria-hidden="true" /> Back
        </Link>
      </header>
      <main id="main" className="max-w-6xl mx-auto px-4 pb-24">
        <section
          aria-labelledby="cards-title"
          className="grid lg:grid-cols-[1fr_1.1fr] gap-6 lg:gap-16 items-center pt-6 sm:pt-12"
        >
          <div className="text-center lg:text-left">
            <span className="hand block -rotate-2 mb-2 !text-xl" aria-hidden="true">
              ↘ no passwords, just your ID
            </span>
            <h1 id="cards-title" className="!text-[clamp(2.25rem,5vw,3.75rem)]">
              Pick a <Squiggle>card</Squiggle>, tap in.
            </h1>
            <p className="meta !text-base mt-4 max-w-md mx-auto lg:mx-0">
              Each demo card holds a real signed token, checked by the same server path as a scanned college
              ID.
            </p>

            <div
              role="radiogroup"
              aria-label="Who do you want to be?"
              className="flex flex-wrap justify-center lg:justify-start gap-2 mt-8"
            >
              {list.map((c, i) => (
                <button
                  key={c.cardId}
                  type="button"
                  role="radio"
                  aria-checked={i === active}
                  onClick={() => setActive(i)}
                  className={`btn btn-sm !px-4 ${i === active ? "btn-primary" : "btn-soft"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {current && (
              <p className="mt-4 min-h-12 enter" key={current.cardId} aria-live="polite">
                <b>{current.name}.</b> {ROLE_BLURB[current.role]}
                {current.pin && <span className="meta block">Staff actions need PIN {current.pin}.</span>}
              </p>
            )}
            <div className="grid gap-3 w-full max-w-sm mx-auto lg:mx-0 mt-4">
              <button
                type="button"
                className="btn btn-yellow !text-lg !py-4"
                disabled={!current || Boolean(busy)}
                onClick={() => current && go(current.token, current.cardId)}
                aria-label={current ? `Tap card: sign in as ${current.name}, ${current.label}` : "Tap card"}
              >
                {busy && busy === current?.cardId ? (
                  <>
                    <Spinner /> Signing in…
                  </>
                ) : (
                  <>
                    <Nfc size={20} aria-hidden="true" /> Tap card
                  </>
                )}
              </button>
              <label className="inline-flex items-center justify-center lg:justify-start gap-2 text-sm min-h-11 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-5 h-5 accent-[var(--ink-900)]"
                  checked={kiosk}
                  onChange={(e) => setKiosk(e.target.checked)}
                />
                Bench kiosk mode (2-minute session)
              </label>
              <ErrorNote error={error ?? cards.error} />
            </div>
          </div>

          <div className="order-first lg:order-none">
            <CardStack cards={list} active={active} onPick={setActive} loading={cards.isLoading} />
          </div>
        </section>

        <details className="mt-16 border-t border-line pt-8">
          <summary className="cursor-pointer list-none flex items-center justify-between gap-4 min-h-11">
            <span>
              <span className="font-display text-2xl block">Using your own college card?</span>
              <span className="meta block">
                Scan its QR, tap it on an NFC phone or reader, or type the code under the QR.
              </span>
            </span>
            <span className="btn-ghost shrink-0" aria-hidden="true">
              <ScanLine size={18} />
            </span>
          </summary>
          <div className="grid gap-3 mt-6 max-w-md">
            <CameraScan onToken={(t) => go(t, "scan")} />
            <NfcTap onToken={(t) => go(t, "nfc")} />
            <TypedToken onToken={(t) => go(t, "typed")} busy={busy === "typed"} />
            <p className="meta">Your card holds no personal data, only a signed number.</p>
          </div>
        </details>
      </main>
    </div>
  );
}

/**
 * A wallet of ID cards: the chosen card hangs in front on a lanyard, the others fan out
 * behind it. Tap a card behind to bring it forward. Springy transform-only motion.
 */
function CardStack({
  cards,
  active,
  onPick,
  loading,
}: {
  cards: DemoCard[];
  active: number;
  onPick: (i: number) => void;
  loading: boolean;
}) {
  const n = cards.length;
  return (
    <div className="relative mx-auto w-[min(340px,74vw)] -translate-x-3 sm:translate-x-0 aspect-[1.586] mt-14 mb-4 sm:mt-20 lg:mt-28">
      <svg
        viewBox="0 0 120 140"
        className="absolute left-1/2 -translate-x-1/2 -top-[52%] w-24 z-30 pointer-events-none"
        aria-hidden="true"
      >
        <path
          d="M20 0 L52 118 M100 0 L68 118"
          stroke="var(--ink-900)"
          strokeWidth="9"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M20 0 L52 118 M100 0 L68 118"
          stroke="var(--yellow)"
          strokeWidth="3"
          strokeLinecap="round"
          fill="none"
          strokeDasharray="2 7"
        />
        <rect x="46" y="110" width="28" height="22" rx="6" fill="var(--ink-900)" />
        <rect x="54" y="128" width="12" height="12" rx="3" fill="var(--bg-muted)" />
      </svg>
      <Illustration
        name="flask"
        className="bob absolute -left-14 -bottom-10 w-20 hidden sm:block"
        style={{ ["--rot" as string]: "-10deg", zIndex: 25 }}
      />
      <Illustration
        name="goggles"
        className="bob b2 absolute -right-16 -top-10 w-20 hidden sm:block"
        style={{ ["--rot" as string]: "8deg", zIndex: 25 }}
      />
      <Spark className="twinkle w-5" style={{ left: "-12px", top: "-16px", zIndex: 40 }} />
      {loading && <Skeleton className="absolute inset-0 !rounded-[20px]" />}
      {cards.map((c, i) => {
        const k = (i - active + n) % n;
        const front = k === 0;
        return (
          <button
            key={c.cardId}
            type="button"
            tabIndex={front ? -1 : 0}
            aria-hidden={front}
            aria-label={front ? undefined : `Show the ${c.label} card`}
            onClick={() => onPick(i)}
            className="absolute inset-0 rounded-[20px] p-5 text-left transition-transform duration-[var(--dur-panel)] ease-[var(--ease-spring)]"
            style={{
              background: CARD_TONE[c.role],
              zIndex: 20 - k,
              transform: front
                ? "rotate(-2deg)"
                : `translate(${k * 5}%, ${-k * 6}%) rotate(${3 + k * 4}deg) scale(${1 - k * 0.05})`,
              boxShadow: front
                ? "var(--shadow-float), inset 0 0 0 1px rgba(0,0,0,.06)"
                : "0 10px 24px -12px rgba(0,0,0,.25), inset 0 0 0 1px rgba(0,0,0,.06)",
              cursor: front ? "default" : "pointer",
            }}
          >
            <span className="flex items-center gap-2 text-sm font-semibold">
              <span className="w-6 h-6 rounded-md bg-ink grid place-items-center" aria-hidden="true">
                <svg viewBox="0 0 64 64" className="w-4 h-4">
                  <path d="M22 16h8v26h14v8H22z" fill="var(--yellow)" />
                </svg>
              </span>
              {c.label}
            </span>
            <span className="block font-display text-[clamp(1.35rem,5vw,1.75rem)] leading-tight mt-3">
              {c.name}
            </span>
            <span className="block mono text-xs mt-1">{c.cardId}</span>
            {c.pin && <span className="block mono text-xs mt-0.5">Staff PIN {c.pin}</span>}
            <img
              src={`data:image/svg+xml;utf8,${encodeURIComponent(c.qrSvg)}`}
              alt={front ? `QR code on the demo card of ${c.name}` : ""}
              className="absolute right-4 bottom-4 w-[30%] aspect-square bg-white rounded-xl p-1.5"
            />
            <span className="absolute left-5 bottom-5 h-2 w-16 rounded-full bg-ink/15" aria-hidden="true" />
          </button>
        );
      })}
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
        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (o: { formats: string[] }) => {
              detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;
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
          await scanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: 220 },
            (text) => {
              if (text.startsWith("LL1.")) {
                onTokenRef.current(text);
                setOn(false);
              }
            },
            () => {},
          );
          stop = () => void scanner.stop().catch(() => {});
        }
      } catch (e) {
        setError(
          errorMessage(e).includes("Permission")
            ? "Camera permission was denied. Use another option below."
            : "Couldn't start the camera on this device.",
        );
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
          <video
            ref={videoRef}
            className="w-full"
            muted
            playsInline
            aria-label="Camera preview for scanning your ID"
          />
          <div id={regionId} />
        </div>
      )}
      {error && (
        <p className="meta" role="alert">
          {error}
        </p>
      )}
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
      const Reader = (
        window as unknown as {
          NDEFReader: new () => {
            scan: () => Promise<void>;
            onreading: (e: { message: { records: { recordType: string; data: DataView }[] } }) => void;
          };
        }
      ).NDEFReader;
      const reader = new Reader();
      await reader.scan();
      setListening(true);
      reader.onreading = (e) => {
        const rec = e.message.records.find((r) => r.recordType === "text");
        // NDEF text record: status byte (language-code length in the low 6 bits), language, then text.
        if (rec)
          onToken(
            new TextDecoder().decode(
              new DataView(rec.data.buffer, rec.data.byteOffset + 1 + (rec.data.getUint8(0) & 0x3f)),
            ),
          );
      };
    } catch {
      setListening(false);
    }
  };
  return (
    <button type="button" className="btn btn-soft" onClick={start} aria-pressed={listening}>
      <Nfc size={18} aria-hidden="true" />{" "}
      {listening ? "Hold your ID to the back of the phone…" : "Tap my ID (NFC)"}
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
        <input
          id={id}
          className="input mono"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="LL1.STU-0001.1.…"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          className="btn btn-primary"
          disabled={busy || !value.trim()}
          aria-label="Sign in with card code"
        >
          <ScanLine size={18} aria-hidden="true" />
        </button>
      </div>
    </form>
  );
}
