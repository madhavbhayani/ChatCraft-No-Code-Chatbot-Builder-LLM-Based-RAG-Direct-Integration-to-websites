package handler

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"
)

// GetPublicEmbedConfig returns public, deployment-safe widget configuration
// for script-tag based embedding.
func (h *BotBuilderHandler) GetPublicEmbedConfig(w http.ResponseWriter, r *http.Request) {
	projectID := strings.TrimSpace(r.PathValue("project_id"))
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "Project ID is required")
		return
	}

	var (
		projectName   string
		chatbotName   string
		themeColor    string
		userFontColor string
		botFontColor  string
		fontFamily    string
		iconURL       string
		iconSource    string
		position      string
		isDeployed    bool
	)

	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT
		    COALESCE(p.name, ''),
		    COALESCE(p.bot_name, ''),
		    COALESCE(c.theme_color, '#DC2626'),
        COALESCE(c.user_font_color, '#FFFFFF'),
        COALESCE(c.bot_font_color, '#111827'),
		    COALESCE(c.font_family, 'Roboto'),
		    COALESCE(c.icon_url, ''),
		    COALESCE(c.icon_source, 'none'),
        COALESCE(b.settings->>'position', 'bottom-right'),
        COALESCE(b.is_deployed, false)
		 FROM projects p
		 LEFT JOIN bot_customizations c ON c.project_id = p.id
     LEFT JOIN LATERAL (
       SELECT settings, is_deployed
       FROM bots
       WHERE project_id = p.id
       ORDER BY updated_at DESC
       LIMIT 1
     ) b ON true
		 WHERE p.id = $1`,
		projectID,
	).Scan(&projectName, &chatbotName, &themeColor, &userFontColor, &botFontColor, &fontFamily, &iconURL, &iconSource, &position, &isDeployed)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "Project not found")
			return
		}
		log.Printf("[embed] config lookup failed: %v", err)
		writeError(w, http.StatusInternalServerError, "Failed to fetch embed config")
		return
	}

	if !isDeployed {
		writeError(w, http.StatusForbidden, "Bot is not deployed")
		return
	}

	if strings.TrimSpace(chatbotName) == "" {
		chatbotName = strings.TrimSpace(projectName)
	}
	if strings.TrimSpace(chatbotName) == "" {
		chatbotName = "Chatbot"
	}
	if strings.TrimSpace(themeColor) == "" {
		themeColor = "#DC2626"
	}
	if strings.TrimSpace(userFontColor) == "" {
		userFontColor = "#FFFFFF"
	}
	if strings.TrimSpace(botFontColor) == "" {
		botFontColor = "#111827"
	}
	if strings.TrimSpace(fontFamily) == "" {
		fontFamily = "Roboto"
	}
	if strings.TrimSpace(position) == "" {
		position = "bottom-right"
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":      projectID,
		"project_name":    projectName,
		"chatbot_name":    chatbotName,
		"theme_color":     themeColor,
		"user_font_color": userFontColor,
		"bot_font_color":  botFontColor,
		"font_family":     fontFamily,
		"icon_url":        iconURL,
		"icon_source":     iconSource,
		"position":        position,
		"chat_endpoint":   "/api/v1/chat/" + projectID,
	})
}

// GetEmbedScript serves a zero-dependency JS widget that can be dropped into any website.
func (h *BotBuilderHandler) GetEmbedScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_, _ = w.Write([]byte(embedWidgetScript))
}

const embedWidgetScript = `(function () {
  if (window.__chatcraftWidgetLoaded) {
    return;
  }
  window.__chatcraftWidgetLoaded = true;

  function findScript() {
    if (document.currentScript) {
      return document.currentScript;
    }
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i -= 1) {
      var src = scripts[i].getAttribute('src') || '';
      if (src.indexOf('/api/v1/embed/script.js') >= 0) {
        return scripts[i];
      }
    }
    return null;
  }

  var scriptEl = findScript();
  if (!scriptEl) {
    console.error('[ChatCraft] Unable to locate embed script tag.');
    return;
  }

  var srcValue = scriptEl.getAttribute('src') || '';
  var srcURL;
  try {
    srcURL = new URL(srcValue, window.location.href);
  } catch (err) {
    console.error('[ChatCraft] Invalid script URL.', err);
    return;
  }

  var projectId = scriptEl.getAttribute('data-project-id') || srcURL.searchParams.get('project_id') || srcURL.searchParams.get('projectId');
  if (!projectId) {
    console.error('[ChatCraft] Missing project_id. Add data-project-id or ?project_id= in script src.');
    return;
  }

  var apiBase = scriptEl.getAttribute('data-api-base') || (srcURL.origin + '/api/v1');
  apiBase = apiBase.replace(/\/$/, '');

  var sessionId = 'cc_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

  var loadedFontsRegistry = window.__chatcraftLoadedGoogleFonts;
  if (!loadedFontsRegistry) {
    loadedFontsRegistry = {};
    window.__chatcraftLoadedGoogleFonts = loadedFontsRegistry;
  }

  var config = {
    chatbot_name: 'Chatbot',
    theme_color: '#DC2626',
    user_font_color: '#FFFFFF',
    bot_font_color: '#111827',
    font_family: 'Roboto, system-ui, sans-serif',
    icon_url: '',
    icon_source: 'none',
    position: 'bottom-right'
  };

  fetch(apiBase + '/embed/config/' + encodeURIComponent(projectId), {
    method: 'GET',
    credentials: 'omit'
  })
    .then(function (res) {
      if (!res.ok) {
        throw new Error('Widget is unavailable (bot not deployed).');
      }
      return res.json();
    })
    .then(function (data) {
      if (data && typeof data === 'object') {
        config = Object.assign(config, data);
      }
      initializeWidget();
    })
    .catch(function (err) {
      console.error('[ChatCraft] Widget disabled:', err && err.message ? err.message : 'Config fetch failed');
    });

  function toFontQueryFamily(fontName) {
    return String(fontName || '')
      .trim()
      .replace(/\s+/g, '+')
      .replace(/[^A-Za-z0-9+\-]/g, '');
  }

  function loadGoogleFont(fontName) {
    var name = String(fontName || '').trim();
    if (!name || typeof document === 'undefined' || !document.head) {
      return;
    }
    if (loadedFontsRegistry[name]) {
      return;
    }

    var family = toFontQueryFamily(name);
    if (!family) {
      return;
    }

    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' + family + ':wght@400;500;600;700&display=swap';
    document.head.appendChild(link);
    loadedFontsRegistry[name] = true;
  }

  function buildFontStack(fontName) {
    var name = String(fontName || '').trim();
    if (!name) {
      return 'Roboto, system-ui, -apple-system, Segoe UI, sans-serif';
    }

    // Preserve explicit stacks if provided by configuration.
    if (name.indexOf(',') >= 0) {
      return name;
    }

    return '"' + name.replace(/"/g, '') + '", system-ui, -apple-system, Segoe UI, sans-serif';
  }

  function initializeWidget() {
    var root = document.createElement('div');
    root.id = 'chatcraft-widget-root';
    document.body.appendChild(root);

    var shadow = root.attachShadow({ mode: 'open' });

    shadow.innerHTML = '' +
      '<style>' +
      ':host{all:initial;}' +
      '.cc-container{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--cc-font);}' +
      '.cc-panel{position:absolute;right:0;bottom:84px;width:360px;max-width:calc(100vw - 24px);height:500px;max-height:72vh;background:#fff;border:1px solid #E5E7EB;border-radius:16px;box-shadow:0 14px 40px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden;opacity:0;transform:translateY(22px) scale(.98);transform-origin:bottom right;visibility:hidden;pointer-events:none;transition:opacity .24s ease, transform .24s cubic-bezier(.22,1,.36,1), visibility 0s linear .24s;}' +
      '.cc-panel.open{opacity:1;transform:translateY(0) scale(1);visibility:visible;pointer-events:auto;transition:opacity .24s ease, transform .24s cubic-bezier(.22,1,.36,1), visibility 0s;}' +
      '.cc-header{background:#111827;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:700;}' +
      '.cc-close{appearance:none;border:none;background:transparent;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;}' +
      '.cc-messages{flex:1;overflow:auto;background:#F9FAFB;padding:12px;}' +
      '.cc-msg-row{display:flex;align-items:flex-end;gap:8px;margin:10px 0;}' +
      '.cc-msg-row.user{justify-content:flex-end;}' +
      '.cc-avatar{width:28px;height:28px;border-radius:999px;flex:0 0 28px;display:flex;align-items:center;justify-content:center;overflow:hidden;}' +
      '.cc-avatar.bot{background:#F3F4F6;border:1px solid #E5E7EB;}' +
      '.cc-avatar.bot img{width:100%;height:100%;object-fit:cover;border-radius:999px;display:block;}' +
      '.cc-avatar.user{background:#111827;color:#fff;}' +
      '.cc-avatar.user svg{width:14px;height:14px;display:block;}' +
      '.cc-msg{max-width:82%;padding:9px 11px;border-radius:12px;font-size:13px;line-height:1.45;word-break:break-word;font-family:inherit;}' +
      '.cc-msg-row.user .cc-msg{background:var(--cc-theme);color:var(--cc-user-text);border-bottom-right-radius:4px;}' +
      '.cc-msg-row.bot .cc-msg{background:#fff;color:var(--cc-bot-text);border:1px solid #E5E7EB;border-bottom-left-radius:4px;}' +
      '.cc-msg p{margin:3px 0;}' +
      '.cc-msg ul{margin:5px 0 5px 16px;padding:0;}' +
      '.cc-msg li{margin:2px 0;}' +
      '.cc-msg .cc-md-table-wrap{margin:8px 0;overflow-x:auto;}' +
      '.cc-msg .cc-md-table{min-width:100%;border:1px solid #E5E7EB;border-collapse:separate;border-spacing:0;border-radius:10px;overflow:hidden;font-size:12px;background:#fff;}' +
      '.cc-msg .cc-md-table th{background:#F9FAFB;text-align:left;padding:7px 9px;border-bottom:1px solid #E5E7EB;font-weight:600;white-space:nowrap;}' +
      '.cc-msg .cc-md-table td{padding:7px 9px;border-bottom:1px solid #F1F5F9;vertical-align:top;}' +
      '.cc-msg .cc-md-table tbody tr:last-child td{border-bottom:none;}' +
      '.cc-msg .cc-md-link{color:#2563EB;text-decoration:none;}' +
      '.cc-msg .cc-md-link:hover{text-decoration:underline;}' +
      '.cc-msg .cc-plain{white-space:pre-wrap;}' +
      '.cc-msg.typing{display:flex;align-items:center;gap:4px;min-height:20px;}' +
      '.cc-dot{width:6px;height:6px;border-radius:999px;background:#9CA3AF;animation:cc-bounce 1s infinite ease-in-out;}' +
      '.cc-dot.d2{animation-delay:.15s;}' +
      '.cc-dot.d3{animation-delay:.3s;}' +
      '@keyframes cc-bounce{0%,80%,100%{transform:scale(.75);opacity:.45;}40%{transform:scale(1);opacity:1;}}' +
      '.cc-input-wrap{border-top:1px solid #E5E7EB;padding:10px;background:#fff;display:flex;gap:8px;}' +
      '.cc-input{flex:1;border:1px solid #D1D5DB;border-radius:10px;padding:9px 11px;font-size:13px;outline:none;font-family:inherit;}' +
      '.cc-input:focus{border-color:var(--cc-theme);box-shadow:0 0 0 3px rgba(0,0,0,.05);}' +
      '.cc-send{appearance:none;border:none;border-radius:999px;background:#111827;color:#fff;width:34px;height:34px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;font-size:16px;line-height:1;font-family:inherit;}' +
      '.cc-send:disabled{opacity:.55;cursor:not-allowed;}' +
      '.cc-launcher{width:62px;height:62px;border-radius:999px;border:none;background:var(--cc-theme);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(0,0,0,.26);cursor:pointer;overflow:hidden;padding:0;}' +
      '.cc-launcher.has-custom-icon{background:transparent;box-shadow:none;}' +
      '.cc-launcher img{width:100%;height:100%;object-fit:cover;display:block;border-radius:999px;box-shadow:0 10px 28px rgba(0,0,0,.22);}' +
      '.cc-name{margin:0 0 6px 0;font-size:10px;font-weight:600;color:#111827;background:transparent;border:none;padding:0;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.2;}' +
      '@media (max-width: 520px){.cc-container{right:12px;bottom:12px;}.cc-panel{height:68vh;bottom:80px;max-width:calc(100vw - 16px);}}' +
      '</style>' +
      '<div class="cc-container" role="dialog" aria-label="Chatbot widget">' +
      '  <div class="cc-panel" id="cc-panel">' +
      '    <div class="cc-header">' +
      '      <span id="cc-title">Chatbot</span>' +
      '      <button class="cc-close" id="cc-close" type="button" aria-label="Close chat">×</button>' +
      '    </div>' +
      '    <div class="cc-messages" id="cc-messages"></div>' +
      '    <div class="cc-input-wrap">' +
      '      <input id="cc-input" class="cc-input" type="text" placeholder="Ask a question..." />' +
      '      <button id="cc-send" class="cc-send" type="button" aria-label="Send message">↑</button>' +
      '    </div>' +
      '  </div>' +
      '  <div id="cc-name" class="cc-name">Ask Chatbot</div>' +
      '  <button id="cc-launcher" class="cc-launcher" type="button" aria-label="Open chat">💬</button>' +
      '</div>';

    var container = shadow.querySelector('.cc-container');
    var panel = shadow.getElementById('cc-panel');
    var launcher = shadow.getElementById('cc-launcher');
    var title = shadow.getElementById('cc-title');
    var nameTag = shadow.getElementById('cc-name');
    var closeBtn = shadow.getElementById('cc-close');
    var messagesBox = shadow.getElementById('cc-messages');
    var input = shadow.getElementById('cc-input');
    var sendBtn = shadow.getElementById('cc-send');

    container.style.setProperty('--cc-theme', normalizeColor(config.theme_color, '#DC2626'));
    container.style.setProperty('--cc-user-text', normalizeColor(config.user_font_color, '#FFFFFF'));
    container.style.setProperty('--cc-bot-text', normalizeColor(config.bot_font_color, '#111827'));
    loadGoogleFont(config.font_family);
    container.style.setProperty('--cc-font', buildFontStack(config.font_family));

    var safeName = String(config.chatbot_name || 'Chatbot').trim() || 'Chatbot';
    title.textContent = safeName;
    nameTag.textContent = 'Ask ' + safeName;

    if (String(config.position || '').toLowerCase() === 'bottom-left') {
      container.style.left = '18px';
      container.style.right = 'auto';
      container.style.alignItems = 'flex-start';
      panel.style.left = '0';
      panel.style.right = 'auto';
      panel.style.transformOrigin = 'bottom left';
    }

    var hasCustomBotIcon = !!(config.icon_url && (config.icon_source === 'uploaded' || config.icon_source === 'predefined'));

    if (hasCustomBotIcon) {
      launcher.classList.add('has-custom-icon');
      launcher.textContent = '';
      var img = document.createElement('img');
      img.src = String(config.icon_url);
      img.alt = safeName;
      launcher.appendChild(img);
    }

    var state = {
      open: false,
      sending: false,
      messages: []
    };

    pushBot('Hi! Ask me anything about this website.');

    launcher.addEventListener('click', function () {
      state.open = !state.open;
      panel.classList.toggle('open', state.open);
      if (state.open) {
        setTimeout(function () {
          input.focus();
        }, 10);
      }
    });

    closeBtn.addEventListener('click', function () {
      state.open = false;
      panel.classList.remove('open');
    });

    sendBtn.addEventListener('click', sendMessage);
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        sendMessage();
      }
    });

    function normalizeColor(color, fallback) {
      var c = String(color || '').trim();
      if (!c) {
        return fallback || '#DC2626';
      }
      return c;
    }

    function scrollToBottom() {
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    function stripInlineLinksFromText(text) {
      var cleaned = String(text || '')
        .replace(/\s*\[\s*Source[^\]]*\]/gi, '')
        .replace(/\(\s*https?:\/\/[^\s)]+\s*\)/gi, '')
        .replace(/https?:\/\/[^\s)]+/gi, '')
        .replace(/^\s*Sources?\s*:?\s*$/gim, '')
        .replace(/^\s*Source\s*\d+\s*:?\s*$/gim, '')
        .replace(/\bSources?\s*\d*\s*:?\s*/gi, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      while (cleaned.indexOf('  ') >= 0) {
        cleaned = cleaned.replace(/  /g, ' ');
      }

      return cleaned;
    }

    function appendInlineNodes(target, line) {
      var remaining = String(line || '');

      while (remaining.length > 0) {
        var linkMatch = remaining.match(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/);
        var boldMatch = remaining.match(/\*\*(.+?)\*\*/);
        var italicMatch = remaining.match(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/);

        var firstMatch = null;
        var matchType = '';
        var firstIndex = 1e9;

        if (linkMatch && linkMatch.index < firstIndex) {
          firstMatch = linkMatch;
          matchType = 'link';
          firstIndex = linkMatch.index;
        }
        if (boldMatch && boldMatch.index < firstIndex) {
          firstMatch = boldMatch;
          matchType = 'bold';
          firstIndex = boldMatch.index;
        }
        if (italicMatch && italicMatch.index < firstIndex) {
          firstMatch = italicMatch;
          matchType = 'italic';
          firstIndex = italicMatch.index;
        }

        if (!firstMatch) {
          target.appendChild(document.createTextNode(remaining));
          break;
        }

        if (firstMatch.index > 0) {
          target.appendChild(document.createTextNode(remaining.substring(0, firstMatch.index)));
        }

        if (matchType === 'link') {
          var a = document.createElement('a');
          a.className = 'cc-md-link';
          a.href = firstMatch[2];
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.textContent = firstMatch[1];
          target.appendChild(a);
        } else if (matchType === 'bold') {
          var strong = document.createElement('strong');
          strong.textContent = firstMatch[1];
          target.appendChild(strong);
        } else {
          var em = document.createElement('em');
          em.textContent = firstMatch[1];
          target.appendChild(em);
        }

        remaining = remaining.substring(firstMatch.index + firstMatch[0].length);
      }
    }

    function splitTableCells(line) {
      return String(line || '')
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map(function (cell) { return cell.trim(); });
    }

    function isTableDivider(line) {
      return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(String(line || ''));
    }

    function renderMarkdownToFragment(text) {
      var value = String(text || '');
      var lines = value.split('\n');
      var frag = document.createDocumentFragment();
      var listItems = [];

      function flushList() {
        if (listItems.length === 0) {
          return;
        }
        var ul = document.createElement('ul');
        for (var i = 0; i < listItems.length; i += 1) {
          ul.appendChild(listItems[i]);
        }
        frag.appendChild(ul);
        listItems = [];
      }

      for (var idx = 0; idx < lines.length; idx += 1) {
        var line = lines[idx];
        var trimmed = line.trim();

        if (idx + 1 < lines.length && line.indexOf('|') >= 0 && isTableDivider(lines[idx + 1])) {
          flushList();

          var headers = splitTableCells(line).slice(0, 6);
          var rows = [];
          idx += 2;

          while (idx < lines.length) {
            var rowLine = lines[idx];
            if (rowLine.trim() === '' || rowLine.indexOf('|') < 0) {
              break;
            }
            var cells = splitTableCells(rowLine).slice(0, 6);
            if (cells.length >= 2 && rows.length < 12) {
              rows.push(cells);
            }
            idx += 1;
          }
          idx -= 1;

          if (headers.length >= 2 && rows.length > 0) {
            var wrap = document.createElement('div');
            wrap.className = 'cc-md-table-wrap';

            var table = document.createElement('table');
            table.className = 'cc-md-table';

            var thead = document.createElement('thead');
            var trh = document.createElement('tr');
            for (var h = 0; h < headers.length; h += 1) {
              var th = document.createElement('th');
              appendInlineNodes(th, headers[h]);
              trh.appendChild(th);
            }
            thead.appendChild(trh);
            table.appendChild(thead);

            var tbody = document.createElement('tbody');
            for (var r = 0; r < rows.length; r += 1) {
              var tr = document.createElement('tr');
              for (var c = 0; c < headers.length; c += 1) {
                var td = document.createElement('td');
                appendInlineNodes(td, rows[r][c] || '');
                tr.appendChild(td);
              }
              tbody.appendChild(tr);
            }
            table.appendChild(tbody);
            wrap.appendChild(table);
            frag.appendChild(wrap);
          }

          continue;
        }

        if (/^[-*•]\s+/.test(trimmed)) {
          var li = document.createElement('li');
          appendInlineNodes(li, trimmed.replace(/^[-*•]\s+/, ''));
          listItems.push(li);
          continue;
        }

        if (/^\d+[.)]\s+/.test(trimmed)) {
          flushList();
          var pNum = document.createElement('p');
          appendInlineNodes(pNum, trimmed);
          frag.appendChild(pNum);
          continue;
        }

        flushList();

        if (trimmed === '') {
          continue;
        }

        var p = document.createElement('p');
        appendInlineNodes(p, trimmed);
        frag.appendChild(p);
      }

      flushList();
      return frag;
    }

    function createUserAvatar() {
      var avatar = document.createElement('div');
      avatar.className = 'cc-avatar user';
      avatar.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" fill="currentColor"></path><path d="M4 19.5c0-3.038 2.962-5.5 8-5.5s8 2.462 8 5.5V21H4v-1.5Z" fill="currentColor"></path></svg>';
      return avatar;
    }

    function createBotAvatar() {
      var avatar = document.createElement('div');
      avatar.className = 'cc-avatar bot';

      if (hasCustomBotIcon) {
        var icon = document.createElement('img');
        icon.src = String(config.icon_url);
        icon.alt = safeName;
        avatar.appendChild(icon);
      } else {
        var fallback = document.createElement('span');
        fallback.textContent = '🤖';
        fallback.style.fontSize = '14px';
        avatar.appendChild(fallback);
      }

      return avatar;
    }

    function updateMessageById(messageId, patch) {
      for (var i = 0; i < state.messages.length; i += 1) {
        if (state.messages[i].id === messageId) {
          state.messages[i] = Object.assign({}, state.messages[i], patch);
          break;
        }
      }
      renderMessages();
    }

    function renderMessages() {
      messagesBox.innerHTML = '';
      for (var i = 0; i < state.messages.length; i += 1) {
        var m = state.messages[i];
        var row = document.createElement('div');
        row.className = 'cc-msg-row ' + (m.role === 'user' ? 'user' : 'bot');

        var bubble = document.createElement('div');
        bubble.className = 'cc-msg';
        var messageText = m.role === 'bot' ? stripInlineLinksFromText(m.text) : String(m.text || '');

        if (m.role === 'bot' && m.streaming && !messageText.trim()) {
          bubble.className = 'cc-msg typing';
          bubble.innerHTML = '<span class="cc-dot"></span><span class="cc-dot d2"></span><span class="cc-dot d3"></span>';
        } else if (m.role === 'bot') {
          bubble.appendChild(renderMarkdownToFragment(messageText));
        } else {
          var plain = document.createElement('div');
          plain.className = 'cc-plain';
          plain.textContent = messageText;
          bubble.appendChild(plain);
        }

        if (m.role === 'user') {
          row.appendChild(bubble);
          row.appendChild(createUserAvatar());
        } else {
          row.appendChild(createBotAvatar());
          row.appendChild(bubble);
        }

        messagesBox.appendChild(row);
      }

      scrollToBottom();
    }

    function pushUser(text) {
      state.messages.push({ role: 'user', text: text });
      renderMessages();
    }

    function pushBot(text, sources) {
      state.messages.push({ role: 'bot', text: text, sources: sources || [] });
      renderMessages();
    }

    async function sendMessage() {
      if (state.sending) {
        return;
      }

      var text = (input.value || '').trim();
      if (!text) {
        return;
      }

      input.value = '';
      state.sending = true;
      sendBtn.disabled = true;
      pushUser(text);

      var streamMessageId = 'cc_bot_' + Math.random().toString(36).slice(2);
      state.messages.push({ id: streamMessageId, role: 'bot', text: '', streaming: true });
      renderMessages();

      var streamedText = '';
      var doneReceived = false;

      try {
        var res = await fetch(apiBase + '/chat/' + encodeURIComponent(projectId), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
          },
          body: JSON.stringify({
            session_id: sessionId,
            message: text,
            stream: true
          })
        });

        var contentType = String(res.headers.get('content-type') || '').toLowerCase();

        if (!contentType.includes('text/event-stream')) {
          var fallbackData = await res.json().catch(function () { return {}; });
          if (!res.ok) {
            throw new Error(fallbackData.error || 'Chat request failed');
          }
          var fallbackAnswer = (fallbackData.answer ? String(fallbackData.answer) : '').trim();
          if (!fallbackAnswer) {
            fallbackAnswer = 'I could not generate a response. Please try again.';
          }
          updateMessageById(streamMessageId, { text: fallbackAnswer, streaming: false });
          return;
        }

        if (!res.ok) {
          var rawError = await res.text().catch(function () { return ''; });
          throw new Error(rawError || 'Chat request failed');
        }

        var reader = res.body && res.body.getReader ? res.body.getReader() : null;
        if (!reader) {
          throw new Error('Streaming response is unavailable');
        }

        var decoder = new TextDecoder();
        var buffer = '';

        function processEventBlock(rawBlock) {
          var block = String(rawBlock || '').trim();
          if (!block) {
            return;
          }

          var eventName = 'message';
          var dataLines = [];
          var lines = block.split('\n');

          for (var li = 0; li < lines.length; li += 1) {
            var line = lines[li];
            if (line.indexOf('event:') === 0) {
              eventName = line.slice(6).trim();
            } else if (line.indexOf('data:') === 0) {
              dataLines.push(line.slice(5).replace(/^\s+/, ''));
            }
          }

          var dataStr = dataLines.join('\n');
          var payload = {};
          if (dataStr) {
            try {
              payload = JSON.parse(dataStr);
            } catch (_err) {
              payload = {};
            }
          }

          if (eventName === 'token') {
            var chunk = payload.text || '';
            if (!chunk) {
              return;
            }
            streamedText += chunk;
            updateMessageById(streamMessageId, { text: streamedText, streaming: true });
            return;
          }

          if (eventName === 'done') {
            doneReceived = true;
            var finalAnswer = payload.answer || streamedText;
            if (!String(finalAnswer || '').trim()) {
              finalAnswer = 'I could not generate a response. Please try again.';
            }
            updateMessageById(streamMessageId, { text: String(finalAnswer), streaming: false });
            return;
          }

          if (eventName === 'error') {
            throw new Error(payload.error || 'Streaming failed');
          }
        }

        while (true) {
          var read = await reader.read();
          if (read.done) {
            break;
          }

          buffer += decoder.decode(read.value, { stream: true });
          var parts = buffer.split('\n\n');
          buffer = parts.pop() || '';

          for (var pi = 0; pi < parts.length; pi += 1) {
            processEventBlock(parts[pi]);
          }
        }

        buffer += decoder.decode();

        if (buffer.trim()) {
          processEventBlock(buffer);
        }

        if (!doneReceived) {
          updateMessageById(streamMessageId, {
            text: streamedText || 'I could not generate a response. Please try again.',
            streaming: false
          });
        }
      } catch (_error) {
        updateMessageById(streamMessageId, {
          text: 'Unable to reach the chatbot right now. Please try again in a moment.',
          streaming: false
        });
      } finally {
        state.sending = false;
        sendBtn.disabled = false;
        input.focus();
      }
    }
  }
})();`
