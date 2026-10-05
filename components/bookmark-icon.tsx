"use client";

import { useEffect, useState } from "react";
import { Globe2 } from "lucide-react";
import { bookmarkIconSources } from "@/lib/bookmark-icons";

export function IconImage({
  icon,
  name,
  url,
}: {
  icon: string;
  name: string;
  url?: string;
}) {
  const sources = bookmarkIconSources(icon, url);
  // Remount when the URL changes so an earlier failure cannot hide the new icon.
  return <IconSources key={sources.join("\n")} sources={sources} name={name} />;
}

function IconSources({ sources, name }: { sources: string[]; name: string }) {
  const [attempt, setAttempt] = useState(0);
  const [loadedSource, setLoadedSource] = useState("");
  const source = sources[attempt];

  useEffect(() => {
    if (!source || loadedSource === source) return;
    // A stalled host must not prevent the remaining sources or fallback loading.
    const timer = window.setTimeout(() => setAttempt(attempt + 1), 5000);
    return () => window.clearTimeout(timer);
  }, [attempt, loadedSource, source]);

  return (
    <>
      {loadedSource !== source && (
        <span
          className="icon-fallback"
          aria-hidden="true"
          style={{
            background: source
              ? "#eef2f6"
              : `hsl(${[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360} 65% 55%)`,
            color: source ? "#8190a5" : undefined,
          }}
        >
          {source ? <Globe2 size={28} /> : [...name][0]}
        </span>
      )}
      {source && (
        <img
          key={source}
          src={source}
          alt=""
          className={source.startsWith("/assets/") ? undefined : "site-favicon"}
          referrerPolicy="no-referrer"
          style={{ opacity: loadedSource === source ? 1 : 0 }}
          onLoad={() => setLoadedSource(source)}
          onError={() => setAttempt(attempt + 1)}
        />
      )}
    </>
  );
}
