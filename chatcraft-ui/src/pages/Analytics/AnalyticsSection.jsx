import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { BarChart3, ExternalLink, Loader2 } from "lucide-react";
import { getSession } from "../../utils/auth";

const API = "/api/v1";

export default function AnalyticsSection() {
  const { projectId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analytics, setAnalytics] = useState(null);
  const [selectedSessionId, setSelectedSessionId] = useState("");

  const token = getSession()?.token || "";

  useEffect(() => {
    const run = async () => {
      if (!projectId || !token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch(`${API}/console/realtime-analytics/${projectId}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error || "Failed to load analytics");
        }

        const normalized = {
          main_stats: data?.main_stats || {},
          sub_stats: data?.sub_stats || {},
          sessions: Array.isArray(data?.sessions) ? data.sessions : [],
          session_conversations: data?.session_conversations || {},
        };

        setAnalytics(normalized);
        if (normalized.sessions.length > 0) {
          setSelectedSessionId(normalized.sessions[0].session_id || "");
        }
      } catch (err) {
        setError(err.message || "Failed to load analytics");
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [projectId, token]);

  const mainStats = analytics?.main_stats || {};
  const subStats = analytics?.sub_stats || {};
  const sessions = analytics?.sessions || [];
  const sessionConversations = analytics?.session_conversations || {};

  const selectedMessages = useMemo(
    () => sessionConversations?.[selectedSessionId] || [],
    [sessionConversations, selectedSessionId]
  );

  const fallbackPie = useMemo(() => {
    const fallback = Number(mainStats.fallback_messages || 0);
    const nonFallback = Number(mainStats.non_fallback_messages || 0);
    const total = fallback + nonFallback;
    const fallbackPercent = total > 0 ? Math.round((fallback / total) * 100) : 0;
    return {
      fallback,
      nonFallback,
      fallbackPercent,
      style: {
        background: `conic-gradient(#DC2626 0 ${fallbackPercent}%, #E5E7EB ${fallbackPercent}% 100%)`,
      },
    };
  }, [mainStats]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold text-charcoal">Realtime Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor chatbot usage, confidence trends, and session-level conversation history in realtime.</p>
        </div>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/50">
            <h3 className="text-sm font-semibold text-charcoal flex items-center gap-2">
              <BarChart3 size={15} />
              Overview
            </h3>
          </div>

          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 size={24} className="text-crimson animate-spin" />
              </div>
            ) : error ? (
              <p className="text-sm text-red-600">{error}</p>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <StatCard title="Total Sessions" value={mainStats.total_sessions || 0} />
                  <StatCard title="Average Confidence" value={`${(Number(mainStats.average_confidence || 0) * 100).toFixed(1)}%`} />
                  <StatCard title="Total Messages" value={mainStats.total_messages || 0} />
                  <StatCard title="Fallback Messages" value={mainStats.fallback_messages || 0} />
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                  <PieChartCard
                    title="Date Wise Sessions (latest 10 sessions)"
                    items={Array.isArray(subStats.date_wise_sessions) ? subStats.date_wise_sessions : []}
                    valueFormatter={(v) => `${v}`}
                  />
                  <PieChartCard
                    title="Messages Per Session"
                    items={Array.isArray(subStats.messages_per_session) ? subStats.messages_per_session : []}
                    valueFormatter={(v) => `${v}`}
                  />
                  <PieChartCard
                    title="Average Confidence Per Session"
                    items={Array.isArray(subStats.confidence_per_session) ? subStats.confidence_per_session : []}
                    valueFormatter={(v) => `${(Number(v || 0) * 100).toFixed(0)}%`}
                  />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-semibold text-charcoal mb-3">Fallback Distribution</h4>
                    <div className="flex items-center gap-4">
                      <div className="relative h-20 w-20 rounded-full" style={fallbackPie.style}>
                        <div className="absolute inset-2 rounded-full bg-white" />
                      </div>
                      <div className="text-sm text-gray-700 space-y-1">
                        <p>Fallback: <strong>{fallbackPie.fallback}</strong></p>
                        <p>Non-fallback: <strong>{fallbackPie.nonFallback}</strong></p>
                        <p>Fallback rate: <strong>{fallbackPie.fallbackPercent}%</strong></p>
                      </div>
                    </div>
                  </section>

                  <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                    <h4 className="text-sm font-semibold text-charcoal mb-1">Average Chat Messages / Session</h4>
                    <p className="text-2xl font-bold text-charcoal">
                      {Number(subStats.average_messages_per_session || 0).toFixed(2)}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">Calculated over latest 10 sessions.</p>
                  </section>
                </div>

                <section className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <h4 className="text-sm font-semibold text-charcoal">Session Conversations</h4>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] min-h-[340px]">
                    <aside className="border-r border-gray-100 max-h-[420px] overflow-y-auto">
                      {sessions.length === 0 ? (
                        <p className="text-sm text-gray-500 p-4">No sessions found for this project.</p>
                      ) : (
                        sessions.map((session) => (
                          <button
                            key={session.session_id}
                            type="button"
                            onClick={() => setSelectedSessionId(session.session_id)}
                            className={`w-full text-left px-4 py-3 border-b border-gray-100 transition ${
                              selectedSessionId === session.session_id
                                ? "bg-crimson/5"
                                : "hover:bg-gray-50"
                            }`}
                          >
                            <p className="text-sm font-medium text-charcoal truncate">{session.title || "Untitled session"}</p>
                            <p className="text-xs text-gray-500 mt-1">Messages: {session.message_count || 0}</p>
                            <p className="text-xs text-gray-500">Avg confidence: {((Number(session.avg_confidence || 0)) * 100).toFixed(0)}%</p>
                          </button>
                        ))
                      )}
                    </aside>

                    <div className="p-4 max-h-[420px] overflow-y-auto bg-[#F9FAFB]">
                      {!selectedSessionId ? (
                        <p className="text-sm text-gray-500">Select a session to view conversation messages.</p>
                      ) : selectedMessages.length === 0 ? (
                        <p className="text-sm text-gray-500">No messages found for selected session.</p>
                      ) : (
                        <div className="space-y-4">
                          {selectedMessages.map((entry, idx) => {
                            const entrySources = extractSourcesFromConversation(entry);
                            return (
                              <div key={`${selectedSessionId}-${idx}`} className="space-y-2">
                                <div className="flex justify-end">
                                  <div className="max-w-[78%] bg-charcoal text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
                                    {entry.user_message}
                                  </div>
                                </div>
                                <div className="flex justify-start">
                                  <div className={`max-w-[78%] bg-white border rounded-2xl rounded-tl-sm px-4 py-2 text-sm ${
                                    entry.fallback ? "border-amber-300" : "border-gray-200"
                                  }`}>
                                    <div className="text-gray-800 leading-relaxed">
                                      {renderMarkdown(stripInlineSourcesFromContent(entry.bot_answer))}
                                    </div>
                                    {Number(entry.confidence || 0) > 0 && (
                                      <p className="text-xs text-gray-400 mt-2">Confidence: {((Number(entry.confidence || 0)) * 100).toFixed(0)}%</p>
                                    )}
                                    {entrySources.length > 0 && (
                                      <div className="mt-2 pt-2 border-t border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">Sources:</p>
                                        <div className="flex flex-wrap items-center gap-2">
                                          {entrySources.map((source, sourceIdx) => (
                                            <a
                                              key={`${source}-${sourceIdx}`}
                                              href={source}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="text-xs text-blue-600 hover:underline"
                                              title={source}
                                            >
                                              Source {sourceIdx + 1}
                                            </a>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <p className="text-center text-xs text-gray-500">Realtime analytics updates on every request.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function extractSourcesFromConversation(entry) {
  if (Array.isArray(entry?.sources) && entry.sources.length > 0) {
    return entry.sources.filter((src) => typeof src === "string" && /^https?:\/\//i.test(src));
  }

  const text = String(entry?.bot_answer || "");
  const regex = /\[\s*Source[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
  const sources = [];
  const seen = new Set();

  let match = regex.exec(text);
  while (match) {
    const url = match[1];
    if (url && !seen.has(url)) {
      seen.add(url);
      sources.push(url);
    }
    match = regex.exec(text);
  }

  return sources;
}

function stripInlineSourcesFromContent(text) {
  return String(text || "")
    .replace(/\s*\[\s*Source[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi, "")
    .replace(/\s*\[\s*Source[^\]]*\]/gi, "")
    .trim();
}

function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let listItems = [];
  let listKey = 0;
  let tableKey = 0;

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-0.5 my-1 text-sm">
          {listItems}
        </ul>
      );
      listItems = [];
    }
  };

  const renderInline = (line) => {
    const parts = [];
    let remaining = line;
    let key = 0;

    while (remaining.length > 0) {
      const linkMatch = remaining.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      const italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

      let firstMatch = null;
      let matchType = null;
      let firstIndex = Infinity;

      if (linkMatch && linkMatch.index < firstIndex) {
        firstMatch = linkMatch;
        matchType = "link";
        firstIndex = linkMatch.index;
      }
      if (boldMatch && boldMatch.index < firstIndex) {
        firstMatch = boldMatch;
        matchType = "bold";
        firstIndex = boldMatch.index;
      }
      if (italicMatch && italicMatch.index < firstIndex) {
        firstMatch = italicMatch;
        matchType = "italic";
        firstIndex = italicMatch.index;
      }

      if (!firstMatch) {
        parts.push(<span key={key++}>{remaining}</span>);
        break;
      }

      if (firstMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.substring(0, firstMatch.index)}</span>);
      }

      if (matchType === "link") {
        const label = firstMatch[1];
        const href = firstMatch[2];
        parts.push(
          <a
            key={key++}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
          >
            {label}
            <ExternalLink size={10} />
          </a>
        );
      } else if (matchType === "bold") {
        parts.push(<strong key={key++} className="font-semibold">{firstMatch[1]}</strong>);
      } else {
        parts.push(<em key={key++}>{firstMatch[1]}</em>);
      }

      remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
    }

    return parts;
  };

  const splitTableCells = (line) =>
    line
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

  const isTableDivider = (line) =>
    /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx];
    const trimmed = line.trim();

    if (
      idx + 1 < lines.length &&
      line.includes("|") &&
      isTableDivider(lines[idx + 1])
    ) {
      flushList();

      const headers = splitTableCells(line).slice(0, 5);
      const rows = [];
      idx += 2;

      while (idx < lines.length) {
        const rowLine = lines[idx];
        if (!rowLine.includes("|") || rowLine.trim() === "") {
          break;
        }
        const cells = splitTableCells(rowLine).slice(0, 5);
        if (cells.length >= 2 && rows.length < 5) {
          rows.push(cells);
        }
        idx += 1;
      }
      idx -= 1;

      if (headers.length >= 2 && rows.length >= 1) {
        elements.push(
          <div key={`table-wrap-${tableKey}`} className="my-3 overflow-x-auto">
            <table className="min-w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
              <thead className="bg-gray-50">
                <tr>
                  {headers.map((h, hIdx) => (
                    <th
                      key={`th-${tableKey}-${hIdx}`}
                      className="px-3 py-2 border-b border-gray-200 text-left font-semibold text-gray-700"
                    >
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={`tr-${tableKey}-${rIdx}`} className="bg-white even:bg-gray-50/40">
                    {headers.map((_, cIdx) => (
                      <td
                        key={`td-${tableKey}-${rIdx}-${cIdx}`}
                        className="px-3 py-2 border-b border-gray-100 align-top"
                      >
                        {renderInline(row[cIdx] || "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        tableKey += 1;
      }

      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(<li key={`li-${idx}`} className="text-sm">{renderInline(content)}</li>);
      continue;
    }

    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+[.)]\s+/, "");
      elements.push(
        <div key={idx} className="flex gap-2 my-0.5 text-sm">
          <span className="text-gray-400 shrink-0">{trimmed.match(/^\d+[.)]/)[0]}</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    flushList();

    if (trimmed === "") {
      elements.push(<div key={idx} className="h-2" />);
      continue;
    }

    elements.push(<p key={idx} className="my-0.5 text-sm">{renderInline(trimmed)}</p>);
  }

  flushList();
  return elements;
}

function StatCard({ title, value }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-charcoal mt-1">{value}</p>
    </div>
  );
}

function PieChartCard({ title, items, valueFormatter }) {
  const safeItems = Array.isArray(items) ? items : [];
  const colors = [
    "#DC2626",
    "#2563EB",
    "#059669",
    "#D97706",
    "#7C3AED",
    "#DB2777",
    "#0D9488",
    "#F59E0B",
    "#4F46E5",
    "#16A34A",
  ];

  const normalized = safeItems.map((item, idx) => {
    const value = Number(item.value || 0);
    return {
      label: item.date || item.label || `Item ${idx + 1}`,
      value,
      color: colors[idx % colors.length],
    };
  });

  const total = normalized.reduce((sum, item) => sum + item.value, 0);

  let start = 0;
  const segments = normalized.map((item) => {
    const percent = total > 0 ? (item.value / total) * 100 : 0;
    const segment = `${item.color} ${start}% ${start + percent}%`;
    start += percent;
    return segment;
  });

  const pieStyle = {
    background: segments.length > 0
      ? `conic-gradient(${segments.join(", ")})`
      : "#E5E7EB",
  };

  return (
    <section className="border border-gray-200 rounded-lg p-4 bg-gray-50">
      <h4 className="text-sm font-semibold text-charcoal mb-3">{title}</h4>
      {normalized.length === 0 || total <= 0 ? (
        <p className="text-sm text-gray-500">No data yet.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="relative h-32 w-32 rounded-full" style={pieStyle}>
              <div className="absolute inset-4 rounded-full bg-white" />
            </div>
          </div>

          <div className="space-y-2">
            {normalized.map((item, idx) => {
              const percent = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={`${item.label}-${idx}`} className="flex items-center justify-between gap-2 text-xs text-gray-700">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span className="shrink-0">{valueFormatter(item.value)} ({percent.toFixed(0)}%)</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
