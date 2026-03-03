# ChatCraft — Copilot Prompt: Advanced Crawler & RAG Pipeline

Use this prompt in GitHub Copilot Chat (or any AI coding assistant).
Paste the full prompt and attach the relevant files when requested.

---

## CONTEXT — What This Project Is

ChatCraft is a no-code LLM-based RAG chatbot builder written in Go.
Users provide their website URL, the backend crawls it, chunks the content,
embeds it using Gemini (`gemini-embedding-001`, 768 dimensions), stores
vectors in Neon PostgreSQL via pgvector, and later uses RAG to answer
questions using the user's own Gemini API key.

**Current tech stack:**
- Go backend hosted on Render
- Neon PostgreSQL + pgvector (768-dimension vectors)
- Gemini API for both embeddings and LLM responses
- Colly for static crawling + Rod (headless Chrome) as JS fallback
- goquery for HTML parsing

---

## FILES TO ATTACH

Attach these files to Copilot before running this prompt:
- `internal/service/crawler.go`
- `internal/handler/bot_builder.go`
- `internal/service/embedder.go`
- `internal/service/chunker.go`
- `internal/model/document.go`
- `internal/model/chunk.go`
- `internal/model/project.go`
- `internal/server/router.go`

---

## PROBLEM ANALYSIS — What Is Wrong Right Now

### Problem 1: CrawlWebsite handler is fully synchronous
In `bot_builder.go`, the `CrawlWebsite` handler calls `service.SmartCrawl()`
directly and blocks the HTTP request until crawling is done. On Render's free
tier, requests timeout after ~30 seconds. A 100-page crawl takes 2-5 minutes.
This means crawling always fails in production.

### Problem 2: No URL priority scoring before crawling
In `crawler.go`, `SmartCrawl()` seeds the Colly queue with all sitemap URLs
directly — up to 9000+ on large sites. There is no prioritization. High-value
pages (FAQ, docs, pricing) are treated the same as low-value pages (tag archives,
author pages, paginated lists). The crawler wastes the 100-page limit on useless
pages.

### Problem 3: No two-phase content filtering
Currently the only filter is `minWordCount = 15`. There is no:
- Link density check (navigation pages with many links but little text)
- Form detection (login/signup pages)
- Content-to-HTML ratio check
These mean nav pages, login pages, and sitemap pages consume crawl slots.

### Problem 4: EmbedChunks is synchronous and unbatched
In `bot_builder.go`, `EmbedChunks` embeds one chunk at a time in a for loop,
blocking the HTTP request. For 300+ chunks this can take 10+ minutes and will
always timeout on Render.

### Problem 5: No incremental re-crawl
When a user re-crawls their site, ALL documents are deleted and re-inserted.
There is no content hash comparison to skip unchanged pages. The `content_hash`
field in the `documents` table exists but is never used for deduplication.

### Problem 6: No RAG chat endpoint
There is no `/chat` endpoint at all. The entire pipeline (crawl → chunk → embed)
exists but there is no way for an embedded chatbot widget to actually ask
questions and get answers via RAG.

### Problem 7: maxPages is hardcoded at 100
The `maxPages = 100` constant in `crawler.go` is not tied to any plan or
project setting. It should be configurable per project.

---

## CHANGES REQUIRED — Implement All of the Following

---

### CHANGE 1: Make CrawlWebsite async with background job tracking

**In `internal/model/` — create a new file `crawl_job.go`:**

```go
package model

import "time"

type CrawlJob struct {
    ID            string    `json:"id"`
    ProjectID     string    `json:"project_id"`
    Status        string    `json:"status"` // queued | running | done | failed
    TotalURLs     int       `json:"total_urls"`
    CrawledURLs   int       `json:"crawled_urls"`
    SkippedURLs   int       `json:"skipped_urls"`
    ChunksCreated int       `json:"chunks_created"`
    ErrorMessage  string    `json:"error_message,omitempty"`
    StartedAt     time.Time `json:"started_at"`
    FinishedAt    *time.Time `json:"finished_at,omitempty"`
}
```

**In the Neon DB — add this table (provide as a comment so dev can run it):**

```sql
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id     UUID REFERENCES projects(id) ON DELETE CASCADE,
    status         TEXT DEFAULT 'queued',
    total_urls     INT DEFAULT 0,
    crawled_urls   INT DEFAULT 0,
    skipped_urls   INT DEFAULT 0,
    chunks_created INT DEFAULT 0,
    error_message  TEXT,
    started_at     TIMESTAMPTZ DEFAULT NOW(),
    finished_at    TIMESTAMPTZ
);
```

**Modify `CrawlWebsite` in `bot_builder.go`:**

1. Instead of calling `service.SmartCrawl()` directly and waiting, do this:
   - Insert a new `crawl_jobs` row with `status = 'queued'`
   - Return `202 Accepted` immediately with the `job_id`
   - Launch a goroutine that calls `service.SmartCrawl()` in the background
   - The goroutine updates the `crawl_jobs` row as it progresses:
     - Set `status = 'running'` when starting
     - Set `status = 'done'` with final counts on success
     - Set `status = 'failed'` with `error_message` on failure
   - After crawling, the goroutine also runs chunking automatically
     (call the same logic as `ChunkDocuments` but inside the goroutine)

2. Add a new handler `GetCrawlJobStatus`:
   - `GET /api/v1/console/crawl-status/{job_id}`
   - Returns the current `crawl_jobs` row as JSON
   - The frontend polls this every 3 seconds to show progress

3. Add the new route to `router.go`:
   ```
   mux.Handle("GET /api/v1/console/crawl-status/{job_id}", authMw(...))
   ```

---

### CHANGE 2: Add URL Priority Scoring to the crawler

**In `crawler.go` — add this function before `SmartCrawl`:**

Add a `scoreURL(rawURL string) int` function that scores each discovered URL
from the sitemap before queuing it. The scoring rules are:

High value (add points):
- URL contains `/faq`, `/help`, `/support`, `/docs`, `/documentation` → +100
- URL contains `/pricing`, `/plans`, `/cost` → +90
- URL contains `/about`, `/contact`, `/team` → +80
- URL contains `/features`, `/product`, `/services` → +75
- URL contains `/blog`, `/article`, `/guide`, `/tutorial` → +40
- Shorter URL path (fewer `/` segments) → +10 per fewer segment vs average

Low value (subtract points):
- URL contains `/tag/`, `/author/`, `/category/`, `/archive/` → -80
- URL contains `/page/2`, `/page/3` (pagination) → -70
- URL contains `?s=`, `?search=` (search result pages) → -60
- URL path has more than 5 segments → -20

**Modify `SmartCrawl` to use priority scoring:**

After `discoverSitemapURLs()` returns the list:
1. Score every URL using `scoreURL()`
2. Filter out URLs with score < -50 (definitely useless)
3. Sort remaining URLs by score descending
4. Take the top N URLs based on `maxPages * 3` (crawl candidates pool)
5. Seed Colly with this prioritized list instead of all URLs

This ensures the 100-page limit is spent on the most valuable pages first.

---

### CHANGE 3: Add Two-Phase Content Filter to the crawler

**In `crawler.go` — add these two functions:**

**Phase 1 filter (free, no API calls) — `passesPhaseOneFilter`:**

```
func passesPhaseOneFilter(doc *goquery.Selection, wordCount int) bool
```

Returns false (skip this page) if ANY of these are true:
- `wordCount < 100` (already exists as minWordCount but raise it to 100)
- Page contains a password input: `doc.Find("input[type='password']").Length() > 0`
- Link density is too high: count all `<a>` tags, divide by word count.
  If ratio > 0.3, it's a navigation page → skip
- The `<body>` text after removing `nav, header, footer` is less than 80 words

Returns true if page passes all checks.

**Apply the Phase 1 filter in the `OnHTML` callback in `SmartCrawl`:**

In the `c.OnHTML("html", ...)` handler, after extracting the page,
call `passesPhaseOneFilter(e.DOM, page.WordCount)`.
If it returns false, increment `report.ThinContentSkipped` and return early.

Note: Phase 2 (LLM classification) is intentionally left for a future PR
to keep costs down. The Phase 1 free filter alone eliminates 60-70% of
bad pages.

---

### CHANGE 4: Make EmbedChunks async with the same job pattern

**Modify `EmbedChunks` in `bot_builder.go`:**

1. Add a new `embed_jobs` table (similar to `crawl_jobs`):
```sql
CREATE TABLE IF NOT EXISTS embed_jobs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id    UUID REFERENCES projects(id) ON DELETE CASCADE,
    status        TEXT DEFAULT 'queued',
    total_chunks  INT DEFAULT 0,
    embedded      INT DEFAULT 0,
    failed        INT DEFAULT 0,
    error_message TEXT,
    started_at    TIMESTAMPTZ DEFAULT NOW(),
    finished_at   TIMESTAMPTZ
);
```

2. `EmbedChunks` handler should:
   - Insert a row in `embed_jobs` with `status = 'queued'`
   - Return `202 Accepted` with `job_id` immediately
   - Launch a goroutine that:
     - Fetches all chunks without embeddings for this project
     - Embeds them using `service.EmbedText()` (keep sequential, Gemini free
       tier is rate-limited)
     - Updates `embedded` count in `embed_jobs` after each successful embed
     - Sets `status = 'done'` or `'failed'` when finished
     - Updates `documents` status to `'embedded'` and `projects.setup_step = 4`
       when all done

3. Add `GET /api/v1/console/embed-status/{job_id}` endpoint and route.

---

### CHANGE 5: Use content_hash for incremental re-crawl

**Modify `CrawlWebsite` (the goroutine part) in `bot_builder.go`:**

Currently on re-crawl, ALL old documents are deleted first. Change this to:

1. Before deleting anything, fetch all existing documents for this project
   into a map: `existingHashes map[string]string` where key = `source_url`,
   value = `content_hash`

2. After crawling, for each new page:
   - Compute `newHash = sha256(rawContent)` (already done)
   - Check if `existingHashes[page.URL] == newHash`
   - If hash is the SAME → skip insertion, keep existing document + chunks
   - If hash is DIFFERENT or URL is new → delete old document + chunks for
     that URL, insert fresh document with `status = 'pending'`

3. Only delete documents whose URLs no longer appear in the new crawl
   (pages that were removed from the site)

This means a re-crawl only re-processes pages that actually changed.

---

### CHANGE 6: Add the RAG Chat endpoint

**Create a new file `internal/handler/chat.go`:**

This is the most important missing piece. Implement:

```
POST /api/v1/chat/{bot_token}
```

This endpoint is PUBLIC (no auth middleware) because it's called from the
embedded widget on the customer's website.

**Request body:**
```json
{
  "session_id": "user-browser-uuid",
  "message": "How do I reset my password?"
}
```

**Response:**
```json
{
  "answer": "To reset your password, go to Settings...",
  "sources": ["https://example.com/help/password"],
  "confidence": 0.89,
  "fallback": false
}
```

**Implementation steps inside the handler:**

**Step 1 — Resolve bot from token:**
```sql
SELECT p.id, p.gemini_api_key_encrypted, p.system_prompt, p.bot_name
FROM projects p
WHERE p.id = $1 AND p.status = 'active'
```
(The `bot_token` IS the `project_id` for now — keep it simple)

**Step 2 — Decrypt the Gemini API key** using `service.DecryptString()`

**Step 3 — Embed the user's question:**
Call `service.EmbedText(ctx, apiKey, userMessage)` to get a 768-dim vector.

**Step 4 — Vector similarity search in pgvector:**
```sql
SELECT c.content, d.source_url,
       1 - (c.embedding <=> $1) AS similarity
FROM chunks c
JOIN documents d ON c.document_id = d.id
WHERE c.project_id = $2
  AND 1 - (c.embedding <=> $1) > 0.65
ORDER BY similarity DESC
LIMIT 5
```
Use `pgvector.NewVector(embedding)` for the `$1` parameter.

**Step 5 — Confidence check:**
- Take the top result's similarity score
- If top score > 0.75 → use RAG (inject context into LLM prompt)
- If top score between 0.65 and 0.75 → use RAG but mark `"confidence": "medium"`
- If no results above 0.65 → return fallback message

**Step 6 — Build RAG prompt and call Gemini:**

Use the Gemini SDK (`google.golang.org/genai`) to call the generative model.
Use model `gemini-2.0-flash` (fast and cheap).

System prompt (use project's `system_prompt` if set, otherwise default):
```
You are a helpful assistant for [bot_name].
Answer ONLY using the context provided below.
If the answer is not in the context, say: "I don't have that information. Please contact support."
Be concise and friendly.
Keep your answer under 150 words unless the question requires more detail.

Context:
[top 3 chunk contents joined with ---]
```

User message: the original question.

**Step 7 — Return structured response** with answer, source URLs, and confidence score.

**Step 8 — Store the conversation** in a `conversations` table:
```sql
INSERT INTO conversations (id, project_id, session_id, user_message, bot_answer, confidence, created_at)
VALUES ($1, $2, $3, $4, $5, $6, NOW())
```

Add this table:
```sql
CREATE TABLE IF NOT EXISTS conversations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    session_id  TEXT NOT NULL,
    user_message TEXT NOT NULL,
    bot_answer  TEXT NOT NULL,
    confidence  FLOAT,
    fallback    BOOLEAN DEFAULT false,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
```

**Add the chat route in `router.go`:**
```go
chatHandler := handler.NewChatHandler(db)
mux.HandleFunc("POST /api/v1/chat/{bot_token}", chatHandler.Chat)
```

Note: No `authMw` on chat — it must be public for embedded widgets.

---

### CHANGE 7: Add CORS support for the chat endpoint specifically

The chat endpoint will be called from customer websites on different domains.
Modify `middleware/cors.go` (or wherever CORS is configured) to:
- Allow ALL origins for `POST /api/v1/chat/*` routes specifically
- Keep existing CORS rules for all other `/api/v1/*` routes

---

### CHANGE 8: Raise minWordCount and fix the constant

In `crawler.go`:
- Change `minWordCount = 15` to `minWordCount = 100`
- Change `maxPages = 100` to be read from an env variable `MAX_CRAWL_PAGES`
  with a default of 100 if the env var is not set

---

## IMPLEMENTATION ORDER

Implement changes in this order to avoid breaking existing functionality:

1. **CHANGE 8** first — simple constant fix, no dependencies
2. **CHANGE 2** — URL priority scoring (pure function, no DB changes)
3. **CHANGE 3** — Phase 1 content filter (pure function, no DB changes)
4. **CHANGE 5** — Incremental crawl hash comparison (modify existing logic)
5. **CHANGE 1** — Async crawl with job tracking (requires new DB table)
6. **CHANGE 4** — Async embed with job tracking (requires new DB table)
7. **CHANGE 6** — RAG chat endpoint (requires new DB table + full new handler)
8. **CHANGE 7** — CORS fix for chat endpoint

---

## IMPORTANT CONSTRAINTS — Do Not Change These

- Keep using `google.golang.org/genai` SDK (NOT OpenAI)
- Keep using `gemini-embedding-001` model for embeddings (768 dimensions)
- Keep using pgvector with the `<=>` cosine distance operator
- Keep the existing `SmartChunkText` function in `chunker.go` unchanged
- Keep the existing `EncryptString`/`DecryptString` functions in `crypto.go`
- Keep the existing auth middleware pattern (`X-User-ID` header)
- Do NOT add any new external dependencies unless absolutely necessary
- All new DB tables must use UUID primary keys with `gen_random_uuid()`
- All timestamps must use `TIMESTAMPTZ` type in PostgreSQL

---

## SUCCESS CRITERIA

After all changes, the following must work:

1. `POST /api/v1/console/crawl/{project_id}` returns `202` instantly with a `job_id`
2. `GET /api/v1/console/crawl-status/{job_id}` returns live progress
3. Crawling a site with 9000 URLs still completes and only processes
   prioritized, high-quality pages
4. Re-crawling the same site with no changes results in 0 new documents
5. `POST /api/v1/console/embed/{project_id}` returns `202` instantly with a `job_id`
6. `GET /api/v1/console/embed-status/{job_id}` shows embedding progress
7. `POST /api/v1/chat/{project_id}` returns a RAG answer using the project's
   knowledge base, with source URLs and confidence score
8. The chat endpoint works from a different domain (CORS passes)