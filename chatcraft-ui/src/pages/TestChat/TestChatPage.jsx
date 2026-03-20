import { useState, useEffect, useRef } from "react";
import {
  Send,
  Loader2,
  Bot,
  User,
  ExternalLink,
  X,
  MoreVertical,
} from "lucide-react";
import "./TestChatPage.css";

export default function TestChatPage({
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
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(null);

  return (
    <div className="test-chat-container">
      {/* Header */}
      <div className="test-chat-header">
        <div className="test-chat-header-inner">
          <h2 className="test-chat-title">Test Chat</h2>
          <p className="test-chat-subtitle">
            Preview how your chatbot responds using the{" "}
            <span className="font-medium text-charcoal">{projectName}</span>{" "}
            knowledge base
          </p>
        </div>
      </div>

      {/* Messages area */}
      <div className="test-chat-messages-wrapper">
        <div className="test-chat-messages">
          {messages.length === 0 && (
            <div className="test-chat-empty">
              <div className="test-chat-empty-icon">
                <Bot size={26} className="text-crimson" />
              </div>
              <h3 className="test-chat-empty-title">Ready to chat</h3>
              <p className="test-chat-empty-text">
                {canChat
                  ? "Type a message below to test your chatbot. Responses are generated using your embedded knowledge base."
                  : !statusData?.has_api_key
                  ? "Add your Gemini API key in Project Settings to enable chat."
                  : "Embed your chunks first to enable chat. Go to Setup Wizard to complete the pipeline."}
              </p>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              messageIndex={idx}
              onSourcesClick={() => setSourcesDialogOpen(idx)}
              isSourcesDialogOpen={sourcesDialogOpen === idx}
              onCloseSourcesDialog={() => setSourcesDialogOpen(null)}
            />
          ))}

          {sending && (
            <div className="test-chat-loading">
              <div className="test-chat-loading-icon">
                <Bot size={15} className="text-crimson" />
              </div>
              <div className="test-chat-loading-bubble">
                <div className="test-chat-loading-dots">
                  <span className="loading-dot" style={{ delay: "0ms" }} />
                  <span className="loading-dot" style={{ delay: "150ms" }} />
                  <span className="loading-dot" style={{ delay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="test-chat-input-wrapper">
        <div className="test-chat-input-inner">
          <div className="test-chat-input-container">
            <div className="test-chat-input-field">
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
                  canChat ? "Type your message..." : "Complete setup to enable chat"
                }
                disabled={!canChat || sending}
                className="test-chat-input"
              />
            </div>
            <button
              onClick={handleSendMessage}
              disabled={!canChat || sending || !chatInput.trim()}
              className="test-chat-send-btn"
            >
              {sending ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <p className="test-chat-footer">
            Responses are generated using your knowledge base via RAG pipeline
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ───────────────────────────────────────────────

function MessageBubble({
  message,
  messageIndex,
  onSourcesClick,
  isSourcesDialogOpen,
  onCloseSourcesDialog,
}) {
  const isUser = message.role === "user";
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef(null);

  // Get unique sources
  const uniqueSources = (() => {
    if (!message.sources || message.sources.length === 0) return [];
    const seen = new Set();
    const unique = [];
    message.sources.forEach((source) => {
      const url = source.url || source;
      if (!seen.has(url)) {
        seen.add(url);
        unique.push({ url, title: source.title || url });
      }
    });
    return unique;
  })();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  return (
    <>
      <div className={`message-bubble-wrapper ${isUser ? "user-message" : ""}`}>
        <div className="message-bubble-avatar">
          {isUser ? (
            <User size={15} className="text-white" />
          ) : (
            <Bot size={15} className="text-crimson" />
          )}
        </div>

        <div className="message-bubble-content">
          <div className={`message-bubble ${isUser ? "user-bubble" : "bot-bubble"} ${message.error ? "error-bubble" : ""}`}>
            <div className="message-text">
              {isUser ? (
                <p className="whitespace-pre-wrap">{message.content}</p>
              ) : (
                renderMarkdown(message.content)
              )}
            </div>
            {!isUser && message.confidence !== undefined && message.confidence > 0 && (
              <p className="message-confidence">
                Confidence: {(message.confidence * 100).toFixed(0)}%
              </p>
            )}
          </div>

          {/* Three-dot menu button - only for bot messages with sources */}
          {!isUser && uniqueSources.length > 0 && (
            <div className="message-menu-wrapper" ref={menuRef}>
              <button
                onClick={() => setShowMenu(!showMenu)}
                className="message-menu-btn"
              >
                <MoreVertical size={16} />
              </button>

              {/* Dropdown menu */}
              {showMenu && (
                <div className="message-menu-dropdown">
                  <button
                    onClick={() => {
                      onSourcesClick();
                      setShowMenu(false);
                    }}
                    className="message-menu-item"
                  >
                    <ExternalLink size={14} />
                    View Sources
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sources Dialog */}
      {isSourcesDialogOpen && uniqueSources.length > 0 && (
        <SourcesDialog sources={uniqueSources} onClose={onCloseSourcesDialog} />
      )}
    </>
  );
}

// ─── Sources Dialog Component ────────────────────────────────────────────────

function SourcesDialog({ sources, onClose }) {
  return (
    <div className="sources-dialog-overlay">
      <div className="sources-dialog">
        {/* Header */}
        <div className="sources-dialog-header">
          <h3 className="sources-dialog-title">Sources</h3>
          <button
            onClick={onClose}
            className="sources-dialog-close"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Sources List */}
        <div className="sources-dialog-list">
          <ol className="sources-list">
            {sources.map((source, idx) => (
              <li key={idx} className="sources-list-item">
                <span className="sources-list-number">{idx + 1}.</span>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sources-list-link"
                >
                  <span className="flex-1">{source.title}</span>
                  <ExternalLink size={14} className="sources-list-icon" />
                </a>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ─── Markdown Renderer ───────────────────────────────────────────────────────

function renderMarkdown(text) {
  if (!text) return null;

  const lines = text.split("\n");
  const elements = [];
  let listItems = [];
  let listKey = 0;
  let tableKey = 0;

  const renderInline = (line) => {
    const parts = [];
    let lastIndex = 0;

    // Link pattern: [text](url)
    const linkRegex = /\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g;
    let linkMatch;
    while ((linkMatch = linkRegex.exec(line)) !== null) {
      if (linkMatch.index > lastIndex) {
        parts.push(line.substring(lastIndex, linkMatch.index));
      }
      parts.push(
        <a
          key={`link-${parts.length}`}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-link"
        >
          {linkMatch[1]}
          <ExternalLink size={12} className="inline-link-icon" />
        </a>
      );
      lastIndex = linkRegex.lastIndex;
    }
    if (lastIndex < line.length) {
      parts.push(line.substring(lastIndex));
    }

    return parts.length > 0 ? parts : [line];
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const trimmed = line.trim();

    // Flush list before processing other elements
    const flushList = () => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`list-${listKey}`} className="markdown-list">
            {listItems.map((item, i) => (
              <li key={i} className="markdown-list-item">
                {renderInline(item)}
              </li>
            ))}
          </ul>
        );
        listItems = [];
        listKey++;
      }
    };

    // Check for table divider
    if (
      /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(trimmed)
    ) {
      flushList();
      continue;
    }

    // Check for table start (header with |)
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushList();
      const headerCells = trimmed
        .split("|")
        .map((c) => c.trim())
        .filter((c) => c);
      let tableRows = [headerCells];
      let nextIdx = idx + 1;

      // Skip divider
      if (
        nextIdx < lines.length &&
        /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/.test(lines[nextIdx])
      ) {
        nextIdx++;
      }

      // Get table body rows
      while (
        nextIdx < lines.length &&
        lines[nextIdx].trim().startsWith("|") &&
        lines[nextIdx].trim().endsWith("|")
      ) {
        const cells = lines[nextIdx]
          .trim()
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c);
        tableRows.push(cells);
        nextIdx++;
      }

      if (tableRows.length >= 2) {
        elements.push(
          <table key={`table-${tableKey}`} className="markdown-table">
            <thead>
              <tr>
                {tableRows[0].map((cell, i) => (
                  <th key={i}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(1).map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
        tableKey++;
        idx = nextIdx - 1;
      }
      continue;
    }

    // Bullet list items
    if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
      const item = trimmed.replace(/^[•\-]\s*/, "");
      listItems.push(item);
      continue;
    }

    // Regular list items (1. 2. etc.)
    const liMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (liMatch) {
      listItems.push(liMatch[1]);
      continue;
    }

    flushList();

    // Headers
    if (trimmed.startsWith("# ")) {
      elements.push(
        <h1 key={idx} className="markdown-h1">
          {renderInline(trimmed.substring(2))}
        </h1>
      );
      continue;
    }
    if (trimmed.startsWith("## ")) {
      elements.push(
        <h2 key={idx} className="markdown-h2">
          {renderInline(trimmed.substring(3))}
        </h2>
      );
      continue;
    }
    if (trimmed.startsWith("### ")) {
      elements.push(
        <h3 key={idx} className="markdown-h3">
          {renderInline(trimmed.substring(4))}
        </h3>
      );
      continue;
    }

    // Regular paragraph
    if (trimmed) {
      elements.push(
        <p key={idx} className="markdown-p">
          {renderInline(trimmed)}
        </p>
      );
    }
  }

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`list-${listKey}`} className="markdown-list">
          {listItems.map((item, i) => (
            <li key={i} className="markdown-list-item">
              {renderInline(item)}
            </li>
          ))}
        </ul>
      );
      listItems = [];
      listKey++;
    }
  };

  flushList();
  return elements;
}
