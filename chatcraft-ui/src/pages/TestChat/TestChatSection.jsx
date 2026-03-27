import { Send, Loader2, Bot, User, ExternalLink } from "lucide-react";

// ─── Test Chat Section ───────────────────────────────────────────────────────

export default function TestChatSection({
  messages,
  chatInput,
  setChatInput,
  sending,
  handleSendMessage,
  chatEndRef,
  inputRef,
  statusData,
  projectName,
}) {
  const canChat = statusData?.embedded_count > 0 && statusData?.has_api_key;

  return (
    <div className="flex-1 flex flex-col bg-[#F9FAFB]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-8 py-5">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-lg font-bold text-charcoal">Test Chat</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Preview how your chatbot responds using the{" "}
            <span className="font-medium text-charcoal">{projectName}</span>{" "}
            knowledge base
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-8 space-y-5">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-crimson/10 flex items-center justify-center mb-5">
                <Bot size={26} className="text-crimson" />
              </div>
              <h3 className="text-base font-bold text-charcoal mb-2">
                Ready to chat
              </h3>
              <p className="text-sm text-gray-400 max-w-sm leading-relaxed">
                {canChat
                  ? "Type a message below to test your chatbot. Responses are generated using your embedded knowledge base."
                  : !statusData?.has_api_key
                  ? "Add your Gemini API key in Project Settings to enable chat."
                  : "Embed your chunks first to enable chat. Go to Setup Wizard to complete the pipeline."}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble key={idx} message={msg} />
          ))}

          {sending && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-crimson/10 flex items-center justify-center shrink-0">
                <Bot size={15} className="text-crimson" />
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="bg-white border-t border-gray-200">
        <div className="max-w-3xl mx-auto px-8 py-5">
          <div className="flex items-center gap-3">
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                placeholder={
                  canChat
                    ? "Type your message..."
                    : "Complete setup to enable chat"
                }
                disabled={!canChat || sending}
                className="w-full px-5 py-3.5 text-sm border border-gray-200 rounded-xl bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-crimson/20 focus:border-crimson/40 transition placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!canChat || sending || !chatInput.trim()}
              className="w-12 h-12 rounded-xl bg-crimson text-white flex items-center justify-center hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Responses are generated using your knowledge base via RAG pipeline
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Simple Markdown Renderer ────────────────────────────────────────────────

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
        <ul key={`list-${listKey++}`} className="list-disc list-inside space-y-0.5 my-1">
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
      // Bold: **text**
      const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
      // Italic: *text* (but not **)
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

      // Add text before match
      if (firstMatch.index > 0) {
        parts.push(<span key={key++}>{remaining.substring(0, firstMatch.index)}</span>);
      }

      // Add formatted text
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

    // Markdown table block
    if (
      idx + 1 < lines.length &&
      line.includes("|") &&
      isTableDivider(lines[idx + 1])
    ) {
      flushList();

      const headers = splitTableCells(line).slice(0, 5);
      const rows = [];
      idx += 2; // skip header + separator

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

    // Bullet list items: - item, * item, • item
    if (/^[-*•]\s+/.test(trimmed)) {
      const content = trimmed.replace(/^[-*•]\s+/, "");
      listItems.push(<li key={`li-${idx}`} className="text-sm">{renderInline(content)}</li>);
      continue;
    }

    // Numbered list items: 1. item, 2. item
    if (/^\d+[.)]\s+/.test(trimmed)) {
      flushList();
      const content = trimmed.replace(/^\d+[.)]\s+/, "");
      elements.push(
        <div key={idx} className="flex gap-2 my-0.5">
          <span className="text-gray-400 shrink-0">{trimmed.match(/^\d+[.)]/)[0]}</span>
          <span>{renderInline(content)}</span>
        </div>
      );
      continue;
    }

    flushList();

    // Empty line = paragraph break
    if (trimmed === "") {
      elements.push(<div key={idx} className="h-2" />);
      continue;
    }

    // Regular text
    elements.push(<p key={idx} className="my-0.5">{renderInline(trimmed)}</p>);
  }

  flushList();
  return elements;
}

function MessageBubble({ message }) {
  const isUser = message.role === "user";
  const rawContent = String(message.content || "");

  // While streaming starts, keep the placeholder hidden until first token arrives.
  if (!isUser && message.streaming && !message.error && rawContent.trim() === "") {
    return null;
  }

  const contentWithoutInlineSources = String(message.content || "")
    .replace(/\s*\[\s*Source[^\]]*\]/gi, "")
    .trim();

  return (
    <div className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? "bg-charcoal" : "bg-crimson/10"
        }`}
      >
        {isUser ? (
          <User size={15} className="text-white" />
        ) : (
          <Bot size={15} className="text-crimson" />
        )}
      </div>

      <div
        className={`max-w-[75%] ${
          isUser
            ? "bg-charcoal text-white rounded-2xl rounded-tr-sm px-4 py-3"
            : `bg-white border ${
                message.error ? "border-red-200" : "border-gray-200"
              } rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm`
        }`}
      >
        <div
          className={`text-sm leading-relaxed ${
            isUser
              ? "text-white"
              : message.error
              ? "text-red-600"
              : "text-gray-800"
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            renderMarkdown(contentWithoutInlineSources)
          )}
        </div>
        {!isUser && message.confidence !== undefined && message.confidence > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Confidence: {(message.confidence * 100).toFixed(0)}%
          </p>
        )}
        {!isUser && Array.isArray(message.sources) && message.sources.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-100">
            <p className="text-xs text-gray-500 mb-1">Sources:</p>
            <div className="flex flex-wrap items-center gap-2">
              {message.sources.map((source, idx) => (
                <a
                  key={`${source}-${idx}`}
                  href={source}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                  title={source}
                >
                  Source {idx + 1}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
