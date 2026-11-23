/**
 * Public landing: why LabLink exists, how it works in three steps, the evidence, and one
 * clear way in ("Try the live demo"). Signed-in users never see it.
 */
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../../components/Layout";
import { Arrow, Burst, Loop, Spark, Squiggle } from "../../components/Doodles";
import { Illustration, type IllustrationName } from "../../components/Illustration";

const STEPS: { title: string; body: string; ill: IllustrationName; tone: string }[] = [
  {
    title: "Describe it",
    body: "Say what you're building and when it's due. Gemini drafts the lab steps, parts and hazards.",
    ill: "robot-arm",
    tone: "var(--yellow-tint)",
  },
  {
    title: "Get a plan that fits",
    body: "LabLink books every step across departments, fairly, before your deadline, in one go.",
    ill: "calendar",
    tone: "var(--green-tint)",
  },
  {
    title: "Work safely",
    body: "Tap in at the bench, check your PPE, and keep SOS one press away. If a machine breaks, we re-plan.",
    ill: "goggles",
    tone: "var(--blue-tint)",
  },
];

const STATS = [
  {
    value: "27.6%",
    label: "of operating time is when big lab instruments actually do useful work",
    source: "Song et al., Frontiers in Education, 2026",
  },
  {
    value: "84.5 h",
    label: "for one equipment-sharing request, across 5 departments and 6 approval steps",
    source: "Song et al., Frontiers in Education, 2026",
  },
  {
    value: "$850k+",
    label: "of duplicate purchases avoided by one shared core facility",
    source: "Quandt et al., J Biomol Tech, 2020",
  },
];

export default function Landing() {
  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Logo />
        <Link to="/demo" className="btn btn-soft btn-sm">
          Sign in
        </Link>
      </header>

      <main id="main">
        {/* Hero */}
        <section
          className="relative max-w-6xl mx-auto px-4 pt-10 pb-20 sm:pt-16 text-center"
          aria-labelledby="hero"
        >
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <Illustration
              name="flask"
              className="bob absolute w-20 sm:w-28 left-[2%] top-6 sm:left-[6%] sm:top-12"
              style={{ ["--rot" as string]: "-8deg" }}
            />
            <Illustration
              name="microscope"
              className="bob b2 absolute w-20 sm:w-28 right-[2%] top-2 sm:right-[7%] sm:top-8"
              style={{ ["--rot" as string]: "6deg" }}
            />
            <Illustration
              name="id-card"
              className="bob b3 absolute hidden sm:block w-28 left-[10%] bottom-0"
              style={{ ["--rot" as string]: "-4deg" }}
            />
            <Illustration
              name="beaker-rack"
              className="bob absolute hidden sm:block w-24 right-[12%] bottom-4"
              style={{ ["--rot" as string]: "5deg" }}
            />
            <Spark className="twinkle w-5" style={{ left: "22%", top: "18%" }} />
            <Spark className="twinkle b2 w-4" color="var(--green)" style={{ right: "24%", top: "30%" }} />
            <Burst className="w-10 hidden sm:block" style={{ right: "30%", top: "6%" }} />
          </div>
          <span className="hand relative block -rotate-3 mb-3 !text-xl" aria-hidden="true">
            ↘ no lab chaos. no spreadsheets.
          </span>
          <h1 id="hero" className="relative">
            Don't just <span className="hl">book</span> equipment.
            <br />
            Make your <Squiggle>project</Squiggle> possible.
          </h1>
          <p className="relative meta !text-lg max-w-xl mx-auto mt-6">
            LabLink turns your idea into a feasible, fair plan across every department's labs, keeps you safe
            at the bench, and re-plans when a machine breaks.
          </p>
          <div className="relative flex flex-wrap justify-center gap-3 mt-8">
            <Link to="/demo" className="btn btn-yellow !text-lg !px-7 !py-4">
              Try the live demo <ArrowRight size={20} aria-hidden="true" />
            </Link>
            <a href="#how" className="btn btn-soft !text-lg !px-7 !py-4">
              How it works
            </a>
          </div>
          <p className="relative meta mt-4">No sign-up. Pick a demo ID card and you're in.</p>
        </section>

        {/* How it works */}
        <section
          id="how"
          className="relative max-w-6xl mx-auto px-4 py-16 border-t border-line"
          aria-labelledby="how-title"
        >
          <h2 id="how-title" className="text-center">
            Three steps, one <Squiggle color="var(--green)">project</Squiggle>
          </h2>
          <Loop className="hidden lg:block w-28 opacity-50" style={{ left: "6%", top: "48px" }} />
          <ol className="relative grid gap-12 md:grid-cols-3 md:gap-8 mt-12">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center grid justify-items-center gap-3">
                <div
                  className="relative w-36 h-36 rounded-full grid place-items-center"
                  style={{ background: s.tone }}
                >
                  <Illustration
                    name={s.ill}
                    className="w-24 h-24 bob"
                    style={{ ["--rot" as string]: `${(i - 1) * 4}deg` }}
                  />
                  <span
                    className="absolute -top-1 -left-1 w-10 h-10 rounded-full bg-ink text-white font-display text-xl grid place-items-center"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </span>
                </div>
                <h3 className="!text-2xl mt-2">{s.title}</h3>
                <p className="meta max-w-xs">{s.body}</p>
                {i < STEPS.length - 1 && (
                  <Arrow
                    className="hidden md:block w-20 opacity-60"
                    style={{ right: "-46px", top: "36px" }}
                  />
                )}
              </li>
            ))}
          </ol>
        </section>

        {/* Evidence */}
        <section className="max-w-6xl mx-auto px-4 py-16 border-t border-line" aria-labelledby="why-title">
          <h2 id="why-title" className="text-center">
            Why labs need this
          </h2>
          <dl className="grid gap-10 md:grid-cols-3 mt-12">
            {STATS.map((s) => (
              <div key={s.value} className="text-center">
                <dt className="font-display text-5xl sm:text-6xl">{s.value}</dt>
                <dd className="mt-3 max-w-xs mx-auto">{s.label}</dd>
                <dd className="meta text-xs mt-2">{s.source}</dd>
              </div>
            ))}
          </dl>
          <p className="text-center mt-12 max-w-2xl mx-auto">
            In our 1,000-request simulation under the same rules, LabLink finished{" "}
            <b>6% more projects on time</b> than first-come-first-served and cut the median wait by <b>38%</b>
            .
            <span className="meta block text-xs mt-1">Simulation on synthetic data, not a field result.</span>
          </p>
        </section>

        {/* Closing CTA */}
        <section className="max-w-6xl mx-auto px-4 pb-24" aria-labelledby="cta-title">
          <div className="relative rounded-[28px] bg-yellow px-6 py-14 text-center overflow-hidden">
            <Illustration
              name="shield"
              className="bob absolute w-20 sm:w-24 left-4 sm:left-10 top-6 opacity-90"
            />
            <Illustration
              name="printer"
              className="bob b2 absolute w-20 sm:w-24 right-4 sm:right-10 bottom-6 opacity-90"
            />
            <h2 id="cta-title" className="relative">
              Built for phones, at the bench.
            </h2>
            <p className="relative max-w-lg mx-auto mt-3">
              Students carry phones into wet labs, not laptops. Everything works one-handed, with SOS always
              in reach.
            </p>
            <Link to="/demo" className="relative btn btn-primary !text-lg !px-7 !py-4 mt-8">
              Try the live demo <ArrowRight size={20} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
