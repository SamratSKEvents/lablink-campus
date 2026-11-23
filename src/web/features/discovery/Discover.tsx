/** Discovery across departments: natural-language search mapped onto real filters. */
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useDeferredValue, useId, useState } from "react";
import { Link } from "react-router-dom";
import { classLabel } from "@shared/catalogue";
import { formatTime, formatDay } from "@shared/time";
import { api } from "../../lib/api";
import type { EquipmentItem } from "../../lib/types";
import { AiNote, Chip, Empty, ErrorNote, Loading, LIVE_STATUS, PageHeader } from "../../components/ui";
import { ClassIcon } from "./ClassIcon";
import { Squiggle } from "../../components/Doodles";

interface SearchResponse {
  items: EquipmentItem[];
  filters: { classIds: string[]; accessibleOnly: boolean; availableNow: boolean } | null;
  aiSource: string | null;
}

export default function Discover() {
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q);
  const id = useId();
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["equipment", deferred],
    queryFn: () => api<SearchResponse>(`/equipment?q=${encodeURIComponent(deferred)}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title={<>Find <Squiggle color="var(--green)">equipment</Squiggle></>} note="↘ every department, one search" doodles="tube" lead="Search every department's labs in plain words: “accessible oscilloscope free now”, “something to cut acrylic”." />
      <form
        role="search"
        className="flex gap-2 bg-white p-1.5 rounded-full mb-6"
        style={{ boxShadow: "var(--shadow-float), var(--ring-hairline)" }}
        onSubmit={(e) => {
          e.preventDefault();
          setQ(input);
        }}
      >
        <label htmlFor={id} className="sr-only">Search equipment</label>
        <input id={id} className="input !bg-transparent !rounded-full flex-1" value={input} onChange={(e) => setInput(e.target.value)} placeholder="What do you need?" />
        <button className="btn btn-yellow" aria-label="Search">
          <Search size={18} aria-hidden="true" /> <span className="hidden sm:inline">Search</span>
        </button>
      </form>
      {data?.filters && q && (
        <div className="mb-6">
          <AiNote source={data.aiSource}>
            Showing {data.filters.classIds.length ? data.filters.classIds.map(classLabel).join(", ") : "matching equipment"}
            {data.filters.accessibleOnly ? ", accessible benches only" : ""}
            {data.filters.availableNow ? ", free units first" : ""}.
          </AiNote>
        </div>
      )}
      <ErrorNote error={error} />
      {isLoading && <Loading label="Searching every lab" />}
      {data && data.items.length === 0 && <Empty title="Nothing matched">Try fewer words, or a type of equipment.</Empty>}
      <ul className={`rows ${isFetching ? "opacity-60" : ""} transition-opacity duration-[var(--dur-fast)]`} aria-live="polite" aria-busy={isFetching}>
        {data?.items.map((e) => {
          const st = LIVE_STATUS[e.liveStatus]!;
          return (
            <li key={e.id}>
              <Link to={`/equipment/${e.id}`} className="group flex flex-wrap sm:flex-nowrap items-center gap-4 py-4 px-2 -mx-2 rounded-2xl hover:bg-subtle transition-colors duration-[var(--dur-fast)]">
                <ClassIcon classId={e.classId} />
                <div className="flex-1 min-w-48">
                  <p className="font-semibold group-hover:underline underline-offset-4">{e.name}</p>
                  <p className="meta">
                    {e.classLabel} · {e.model} · {e.lab}, bench {e.bench}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {e.requiresCert && <Chip tone="violet" dot={false}>🎓 Certified only</Chip>}
                  {e.capacity > 1 && <Chip tone="neutral" dot={false}>Seats {e.capacity}</Chip>}
                  {e.accessible && <Chip tone="neutral" dot={false}>♿ Accessible</Chip>}
                  <Chip tone={st.tone}>{e.liveStatus === "free" ? st.label : e.nextFree ? `${st.label} · free ${formatDay(e.nextFree)} ${formatTime(e.nextFree)}` : st.label}</Chip>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
