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
		projectName string
		chatbotName string
		themeColor  string
		fontFamily  string
		iconURL     string
		iconSource  string
		position    string
		isDeployed  bool
	)

	err := h.DB.Pool.QueryRow(r.Context(),
		`SELECT
		    COALESCE(p.name, ''),
		    COALESCE(p.bot_name, ''),
		    COALESCE(c.theme_color, '#DC2626'),
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
	).Scan(&projectName, &chatbotName, &themeColor, &fontFamily, &iconURL, &iconSource, &position, &isDeployed)
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
	if strings.TrimSpace(fontFamily) == "" {
		fontFamily = "Roboto"
	}
	if strings.TrimSpace(position) == "" {
		position = "bottom-right"
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"project_id":    projectID,
		"project_name":  projectName,
		"chatbot_name":  chatbotName,
		"theme_color":   themeColor,
		"font_family":   fontFamily,
		"icon_url":      iconURL,
		"icon_source":   iconSource,
		"position":      position,
		"chat_endpoint": "/api/v1/chat/" + projectID,
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

  var config = {
    chatbot_name: 'Chatbot',
    theme_color: '#DC2626',
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
        throw new Error('Failed to fetch widget config');
      }
      return res.json();
    })
    .then(function (data) {
      if (data && typeof data === 'object') {
        config = Object.assign(config, data);
      }
    })
    .catch(function () {
      // Widget still initializes with defaults for resilience.
    })
    .finally(function () {
      initializeWidget();
    });

  function initializeWidget() {
    var root = document.createElement('div');
    root.id = 'chatcraft-widget-root';
    document.body.appendChild(root);

    var shadow = root.attachShadow({ mode: 'open' });

    shadow.innerHTML = '' +
      '<style>' +
      ':host{all:initial;}' +
      '.cc-container{position:fixed;right:18px;bottom:18px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;font-family:var(--cc-font);}' +
      '.cc-panel{width:360px;max-width:calc(100vw - 24px);height:500px;max-height:72vh;background:#fff;border:1px solid #E5E7EB;border-radius:16px;box-shadow:0 14px 40px rgba(15,23,42,.22);display:none;overflow:hidden;margin-bottom:12px;}' +
      '.cc-panel.open{display:flex;flex-direction:column;}' +
      '.cc-header{background:#111827;color:#fff;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;font-size:14px;font-weight:700;}' +
      '.cc-close{appearance:none;border:none;background:transparent;color:#fff;font-size:18px;line-height:1;cursor:pointer;padding:0 2px;}' +
      '.cc-messages{flex:1;overflow:auto;background:#F9FAFB;padding:10px;}' +
      '.cc-msg-row{display:flex;margin:8px 0;}' +
      '.cc-msg-row.user{justify-content:flex-end;}' +
      '.cc-msg{max-width:85%;padding:9px 11px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;}' +
      '.cc-msg-row.user .cc-msg{background:#111827;color:#fff;border-bottom-right-radius:4px;}' +
      '.cc-msg-row.bot .cc-msg{background:#fff;color:#111827;border:1px solid #E5E7EB;border-bottom-left-radius:4px;}' +
      '.cc-sources{margin-top:7px;padding-top:7px;border-top:1px solid #F1F5F9;font-size:11px;}' +
      '.cc-sources-label{color:#6B7280;margin-bottom:4px;}' +
      '.cc-sources-list{display:flex;gap:8px;flex-wrap:wrap;}' +
      '.cc-sources-list a{color:#2563EB;text-decoration:none;}' +
      '.cc-sources-list a:hover{text-decoration:underline;}' +
      '.cc-input-wrap{border-top:1px solid #E5E7EB;padding:10px;background:#fff;display:flex;gap:8px;}' +
      '.cc-input{flex:1;border:1px solid #D1D5DB;border-radius:10px;padding:9px 11px;font-size:13px;outline:none;}' +
      '.cc-input:focus{border-color:var(--cc-theme);box-shadow:0 0 0 3px rgba(0,0,0,.05);}' +
      '.cc-send{appearance:none;border:none;border-radius:10px;background:var(--cc-theme);color:#fff;padding:0 14px;font-weight:600;cursor:pointer;}' +
      '.cc-send:disabled{opacity:.55;cursor:not-allowed;}' +
      '.cc-launcher{width:62px;height:62px;border-radius:999px;border:none;background:var(--cc-theme);color:#fff;font-size:24px;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 28px rgba(0,0,0,.26);cursor:pointer;overflow:hidden;}' +
      '.cc-launcher img{width:100%;height:100%;object-fit:cover;}' +
      '.cc-name{margin-top:7px;font-size:12px;font-weight:700;color:#000;background:#fff;border:1px solid #E5E7EB;border-radius:999px;padding:4px 9px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.cc-typing{color:#6B7280;font-size:12px;padding:4px 0 0 2px;}' +
      '@media (max-width: 520px){.cc-container{right:12px;bottom:12px;}.cc-panel{height:68vh;}}' +
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
      '      <button id="cc-send" class="cc-send" type="button">Send</button>' +
      '    </div>' +
      '  </div>' +
      '  <button id="cc-launcher" class="cc-launcher" type="button" aria-label="Open chat">💬</button>' +
      '  <div id="cc-name" class="cc-name">Chatbot</div>' +
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

    container.style.setProperty('--cc-theme', normalizeColor(config.theme_color));
    container.style.setProperty('--cc-font', (config.font_family || 'Roboto, system-ui, sans-serif'));

    var safeName = String(config.chatbot_name || 'Chatbot').trim() || 'Chatbot';
    title.textContent = safeName;
    nameTag.textContent = safeName;

    if (String(config.position || '').toLowerCase() === 'bottom-left') {
      container.style.left = '18px';
      container.style.right = 'auto';
      container.style.alignItems = 'flex-start';
    }

    if (config.icon_url && (config.icon_source === 'uploaded' || config.icon_source === 'predefined')) {
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

    function normalizeColor(color) {
      var c = String(color || '').trim();
      if (!c) {
        return '#DC2626';
      }
      return c;
    }

    function scrollToBottom() {
      messagesBox.scrollTop = messagesBox.scrollHeight;
    }

    function renderMessages() {
      messagesBox.innerHTML = '';
      for (var i = 0; i < state.messages.length; i += 1) {
        var m = state.messages[i];
        var row = document.createElement('div');
        row.className = 'cc-msg-row ' + (m.role === 'user' ? 'user' : 'bot');

        var bubble = document.createElement('div');
        bubble.className = 'cc-msg';
        bubble.textContent = m.text;
        row.appendChild(bubble);

        if (m.role === 'bot' && Array.isArray(m.sources) && m.sources.length > 0) {
          var sourceWrap = document.createElement('div');
          sourceWrap.className = 'cc-sources';

          var sourceLabel = document.createElement('div');
          sourceLabel.className = 'cc-sources-label';
          sourceLabel.textContent = 'Sources:';
          sourceWrap.appendChild(sourceLabel);

          var sourceList = document.createElement('div');
          sourceList.className = 'cc-sources-list';

          for (var s = 0; s < m.sources.length; s += 1) {
            var link = document.createElement('a');
            link.href = m.sources[s];
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = 'Source ' + (s + 1);
            sourceList.appendChild(link);
          }

          sourceWrap.appendChild(sourceList);
          bubble.appendChild(sourceWrap);
        }

        messagesBox.appendChild(row);
      }

      if (state.sending) {
        var typing = document.createElement('div');
        typing.className = 'cc-typing';
        typing.textContent = 'Thinking...';
        messagesBox.appendChild(typing);
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

    function sendMessage() {
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

      fetch(apiBase + '/chat/' + encodeURIComponent(projectId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          session_id: sessionId,
          message: text
        })
      })
        .then(function (res) {
          if (!res.ok) {
            return res.json().catch(function () { return {}; }).then(function (body) {
              throw new Error(body.error || 'Chat request failed');
            });
          }
          return res.json();
        })
        .then(function (data) {
          var answer = (data && data.answer ? String(data.answer) : '').trim();
          if (!answer) {
            answer = 'I could not generate a response. Please try again.';
          }
          pushBot(answer, Array.isArray(data.sources) ? data.sources : []);
        })
        .catch(function () {
          pushBot('Unable to reach the chatbot right now. Please try again in a moment.');
        })
        .finally(function () {
          state.sending = false;
          sendBtn.disabled = false;
          input.focus();
          renderMessages();
        });
    }
  }
})();`
