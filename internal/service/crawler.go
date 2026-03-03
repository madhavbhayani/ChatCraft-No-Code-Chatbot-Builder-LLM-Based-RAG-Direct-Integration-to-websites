package service

import (
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/PuerkitoBio/goquery"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"github.com/gocolly/colly/v2"
	"github.com/temoto/robotstxt"
)

// ---------- Configuration ----------

const (
	minWordCount = 100 // Minimum words to keep a page (raised for quality filtering)
)

// getMaxPages returns the max crawl pages from env MAX_CRAWL_PAGES, defaulting to 100.
func getMaxPages() int {
	if v := os.Getenv("MAX_CRAWL_PAGES"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return n
		}
	}
	return 100
}

// ---------- Types ----------

// QAPair represents a question-answer pair extracted from FAQ sections.
type QAPair struct {
	Question string `json:"question"`
	Answer   string `json:"answer"`
}

// PageContent holds rich extracted content from a single crawled page.
type PageContent struct {
	URL         string   `json:"url"`
	Title       string   `json:"title"`
	MetaDesc    string   `json:"meta_desc,omitempty"`
	Headings    []string `json:"headings,omitempty"`
	MainContent string   `json:"main_content"`
	FAQs        []QAPair `json:"faqs,omitempty"`
	ContentType string   `json:"content_type"` // faq, article, product, general
	WordCount   int      `json:"word_count"`
}

// CrawlReport provides quality metrics about the completed crawl.
type CrawlReport struct {
	PagesCrawled       int     `json:"pages_crawled"`
	FAQsDetected       int     `json:"faqs_detected"`
	ThinContentSkipped int     `json:"thin_content_skipped"`
	RobotsTxtBlocked   int     `json:"robotstxt_blocked"`
	DuplicatesSkipped  int     `json:"duplicates_skipped"`
	TotalWords         int     `json:"total_words"`
	AvgWordsPerPage    int     `json:"avg_words_per_page"`
	CrawlDurationSecs  float64 `json:"crawl_duration_secs"`
	ErrorCount         int     `json:"error_count"`
	JSRendered         bool    `json:"js_rendered"`
}

// CrawlResult is the return type of SmartCrawl.
type CrawlResult struct {
	Pages  []PageContent `json:"pages"`
	Report CrawlReport   `json:"report"`
}

// ---------- User-Agent Rotation ----------

var userAgents = []string{
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
	"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
}

func randomUA() string {
	return userAgents[rand.Intn(len(userAgents))]
}

// ---------- URL Filtering & Normalization ----------

var skipExtensions = map[string]bool{
	".pdf": true, ".jpg": true, ".jpeg": true, ".png": true, ".gif": true,
	".svg": true, ".webp": true, ".ico": true, ".bmp": true,
	".css": true, ".js": true, ".json": true, ".xml": true,
	".woff": true, ".woff2": true, ".ttf": true, ".eot": true,
	".zip": true, ".tar": true, ".gz": true, ".rar": true, ".7z": true,
	".mp4": true, ".mp3": true, ".avi": true, ".mov": true, ".webm": true,
	".doc": true, ".docx": true, ".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true,
}

var skipPathPatterns = []string{
	"/login", "/signin", "/signup", "/register", "/logout",
	"/cart", "/checkout", "/account", "/my-account",
	"/admin", "/wp-admin/", "/wp-json/", "/wp-login",
	"/cdn-cgi/", "/api/", "/_next/",
	"/feed/", "/rss/", "/atom/",
}

var trackingParams = map[string]bool{
	"utm_source": true, "utm_medium": true, "utm_campaign": true,
	"utm_term": true, "utm_content": true,
	"fbclid": true, "gclid": true, "ref": true,
	"mc_cid": true, "mc_eid": true, "msclkid": true,
}

func shouldSkipURL(rawURL string) bool {
	lower := strings.ToLower(rawURL)
	// Check file extensions
	for ext := range skipExtensions {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	parsed, err := url.Parse(lower)
	if err != nil {
		return true
	}
	path := parsed.Path
	// Ensure path ends with / for pattern matching to avoid partial matches
	// e.g. "/feedback" should NOT match "/feed"
	for _, pat := range skipPathPatterns {
		if strings.HasSuffix(pat, "/") {
			// Exact prefix match
			if strings.HasPrefix(path, pat) {
				return true
			}
		} else {
			// Match exact path segment
			if path == pat || strings.HasPrefix(path, pat+"/") || strings.HasPrefix(path, pat+"?") {
				return true
			}
		}
	}
	return false
}

func normalizeURL(rawURL string) string {
	u, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	u.Fragment = ""
	q := u.Query()
	changed := false
	for p := range trackingParams {
		if q.Has(p) {
			q.Del(p)
			changed = true
		}
	}
	if changed {
		u.RawQuery = q.Encode()
	}
	if u.Path != "/" {
		u.Path = strings.TrimRight(u.Path, "/")
	}
	return u.String()
}

// extractRootDomain extracts the registrable root domain from a hostname.
// e.g. "blog.gamingmitro.com" → "gamingmitro.com"
func extractRootDomain(domain string) string {
	parts := strings.Split(domain, ".")
	if len(parts) <= 2 {
		return domain // already root like "example.com"
	}
	// Take last 2 parts: gamingmitro.com from blog.gamingmitro.com
	return strings.Join(parts[len(parts)-2:], ".")
}

// ---------- Sitemap Parsing ----------

type sitemapIndex struct {
	XMLName  xml.Name     `xml:"sitemapindex"`
	Sitemaps []sitemapLoc `xml:"sitemap"`
}

type sitemapLoc struct {
	Loc string `xml:"loc"`
}

type urlSet struct {
	XMLName xml.Name `xml:"urlset"`
	URLs    []urlLoc `xml:"url"`
}

type urlLoc struct {
	Loc string `xml:"loc"`
}

// discoverSitemapURLs fetches sitemap.xml / sitemap_index.xml and extracts page URLs.
func discoverSitemapURLs(baseURL string) []string {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil
	}
	origin := fmt.Sprintf("%s://%s", parsed.Scheme, parsed.Host)

	var urls []string
	seen := make(map[string]bool)
	add := func(u string) {
		n := normalizeURL(u)
		if !seen[n] && !shouldSkipURL(n) {
			seen[n] = true
			urls = append(urls, n)
		}
	}

	client := &http.Client{Timeout: 15 * time.Second}
	paths := []string{"/sitemap_index.xml", "/sitemap.xml", "/sitemap/sitemap.xml"}

	for _, path := range paths {
		resp, err := client.Get(origin + path)
		if err != nil || resp.StatusCode != 200 {
			if resp != nil {
				resp.Body.Close()
			}
			continue
		}
		body, err := io.ReadAll(io.LimitReader(resp.Body, 5<<20))
		resp.Body.Close()
		if err != nil {
			continue
		}

		// Try as sitemap index first
		var idx sitemapIndex
		if xml.Unmarshal(body, &idx) == nil && len(idx.Sitemaps) > 0 {
			log.Printf("[crawler] Found sitemap index at %s (%d sitemaps)", origin+path, len(idx.Sitemaps))
			for _, sm := range idx.Sitemaps {
				childResp, err := client.Get(sm.Loc)
				if err != nil || childResp.StatusCode != 200 {
					if childResp != nil {
						childResp.Body.Close()
					}
					continue
				}
				childBody, _ := io.ReadAll(io.LimitReader(childResp.Body, 5<<20))
				childResp.Body.Close()
				var us urlSet
				if xml.Unmarshal(childBody, &us) == nil {
					for _, u := range us.URLs {
						add(u.Loc)
					}
				}
			}
			break
		}

		// Try as regular urlset
		var us urlSet
		if xml.Unmarshal(body, &us) == nil && len(us.URLs) > 0 {
			log.Printf("[crawler] Found sitemap at %s (%d URLs)", origin+path, len(us.URLs))
			for _, u := range us.URLs {
				add(u.Loc)
			}
			break
		}
	}

	log.Printf("[crawler] Discovered %d URLs from sitemap", len(urls))
	return urls
}

// ---------- Robots.txt ----------

func fetchRobotsTxt(baseURL string) *robotstxt.RobotsData {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil
	}
	robotsURL := fmt.Sprintf("%s://%s/robots.txt", parsed.Scheme, parsed.Host)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(robotsURL)
	if err != nil || resp.StatusCode != 200 {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil
	}

	robots, err := robotstxt.FromBytes(body)
	if err != nil {
		log.Printf("[crawler] Failed to parse robots.txt: %v", err)
		return nil
	}
	log.Printf("[crawler] Loaded robots.txt from %s", robotsURL)
	return robots
}

func isAllowedByRobots(robots *robotstxt.RobotsData, pageURL string) bool {
	if robots == nil {
		return true
	}
	parsed, err := url.Parse(pageURL)
	if err != nil {
		return true
	}
	return robots.TestAgent(parsed.Path, "*")
}

// ---------- Content Extraction ----------

// extractPageContent parses a crawled HTML page into structured PageContent.
func extractPageContent(e *colly.HTMLElement) *PageContent {
	return extractPageContentFromDoc(e.DOM, e.Request.URL.String())
}

// extractPageContentFromDoc extracts structured content from a goquery
// selection and page URL. Shared by Colly and Rod (headless) code paths.
func extractPageContentFromDoc(doc *goquery.Selection, pageURL string) *PageContent {

	// Title: prefer <title>, fallback to <h1>
	title := strings.TrimSpace(doc.Find("title").First().Text())
	if title == "" {
		title = strings.TrimSpace(doc.Find("h1").First().Text())
	}

	// Meta description
	metaDesc, _ := doc.Find(`meta[name="description"]`).Attr("content")
	metaDesc = strings.TrimSpace(metaDesc)

	// Collect headings
	var headings []string
	doc.Find("h1, h2, h3").Each(func(_ int, s *goquery.Selection) {
		text := strings.TrimSpace(s.Text())
		if text != "" && len(text) < 200 {
			headings = append(headings, text)
		}
	})

	// Extract FAQs BEFORE removing elements
	faqs := extractFAQs(doc)

	// Remove non-content elements (only HTML semantic tags — no CSS classes
	// to avoid accidentally removing content-bearing elements on different sites)
	doc.Find("script, style, noscript, iframe, svg").Remove()

	// Priority-based main content extraction
	var mainContent string
	contentSelectors := []string{
		"main article", "article", "main", "[role='main']",
		".content", ".post-content", ".entry-content",
		".article-body", ".page-content", "#content",
	}
	for _, sel := range contentSelectors {
		if found := doc.Find(sel); found.Length() > 0 {
			mainContent = extractStructuredText(found)
			if len(strings.Fields(mainContent)) >= minWordCount {
				break
			}
		}
	}

	// Fallback 1: structured extraction from body
	if len(strings.Fields(mainContent)) < minWordCount {
		mainContent = extractStructuredText(doc.Find("body"))
	}

	// Fallback 2: raw body text (same approach as old crawler — most robust)
	if len(strings.Fields(mainContent)) < minWordCount {
		// Remove nav/footer/header/aside for clean body text
		bodyCopy := doc.Find("body").Clone()
		bodyCopy.Find("nav, footer, header, aside, form, button").Remove()
		bodyText := strings.TrimSpace(bodyCopy.Text())
		if len(strings.Fields(bodyText)) > len(strings.Fields(mainContent)) {
			mainContent = bodyText
		}
	}

	mainContent = cleanText(mainContent)
	wordCount := len(strings.Fields(mainContent))
	contentType := detectContentType(pageURL, doc, faqs)

	return &PageContent{
		URL:         pageURL,
		Title:       title,
		MetaDesc:    metaDesc,
		Headings:    headings,
		MainContent: mainContent,
		FAQs:        faqs,
		ContentType: contentType,
		WordCount:   wordCount,
	}
}

// extractStructuredText extracts text preserving heading markers for smart chunking.
func extractStructuredText(sel *goquery.Selection) string {
	var parts []string

	sel.Find("h1, h2, h3, h4, h5, h6, p, li, td, th, blockquote, dd, dt, figcaption, span, div").Each(func(_ int, s *goquery.Selection) {
		// Skip elements that have child block elements (avoid double-counting)
		if s.Find("p, h1, h2, h3, h4, h5, h6, li, blockquote").Length() > 0 {
			tag := goquery.NodeName(s)
			if tag == "div" || tag == "span" {
				return // skip wrapper divs, their children will be processed individually
			}
		}

		text := strings.TrimSpace(s.Text())
		if text == "" || len(text) > 5000 {
			return
		}

		tag := goquery.NodeName(s)
		switch tag {
		case "h1":
			parts = append(parts, "\n# "+text)
		case "h2":
			parts = append(parts, "\n## "+text)
		case "h3":
			parts = append(parts, "\n### "+text)
		case "h4", "h5", "h6":
			parts = append(parts, "\n#### "+text)
		case "li":
			parts = append(parts, "• "+text)
		default:
			parts = append(parts, text)
		}
	})

	return strings.Join(parts, "\n")
}

// ---------- FAQ Extraction ----------

type faqPageSchema struct {
	Type       string          `json:"@type"`
	MainEntity []faqItemSchema `json:"mainEntity"`
}

type faqItemSchema struct {
	Type           string          `json:"@type"`
	Name           string          `json:"name"`
	AcceptedAnswer faqAnswerSchema `json:"acceptedAnswer"`
}

type faqAnswerSchema struct {
	Type string `json:"@type"`
	Text string `json:"text"`
}

type faqGraphSchema struct {
	Graph []faqPageSchema `json:"@graph"`
}

// extractFAQs detects FAQ Q&A pairs from Schema.org JSON-LD, dt/dd lists, and accordion patterns.
func extractFAQs(doc *goquery.Selection) []QAPair {
	var faqs []QAPair
	seen := make(map[string]bool)

	add := func(q, a string) {
		q = strings.TrimSpace(q)
		a = strings.TrimSpace(a)
		if q != "" && a != "" && len(q) < 500 && !seen[q] {
			seen[q] = true
			faqs = append(faqs, QAPair{Question: q, Answer: a})
		}
	}

	// Pattern 1: Schema.org FAQPage JSON-LD
	doc.Find(`script[type="application/ld+json"]`).Each(func(_ int, s *goquery.Selection) {
		text := s.Text()
		if !strings.Contains(text, "FAQPage") && !strings.Contains(text, "Question") {
			return
		}

		// Try single object
		var schema faqPageSchema
		if json.Unmarshal([]byte(text), &schema) == nil {
			for _, item := range schema.MainEntity {
				add(item.Name, item.AcceptedAnswer.Text)
			}
		}

		// Try array format
		var arr []faqPageSchema
		if json.Unmarshal([]byte(text), &arr) == nil {
			for _, s := range arr {
				for _, item := range s.MainEntity {
					add(item.Name, item.AcceptedAnswer.Text)
				}
			}
		}

		// Try @graph format
		var graph faqGraphSchema
		if json.Unmarshal([]byte(text), &graph) == nil {
			for _, s := range graph.Graph {
				for _, item := range s.MainEntity {
					add(item.Name, item.AcceptedAnswer.Text)
				}
			}
		}
	})

	// Pattern 2: <dl> definition lists (dt/dd pairs)
	doc.Find("dl").Each(func(_ int, dl *goquery.Selection) {
		dl.Find("dt").Each(func(_ int, dt *goquery.Selection) {
			q := strings.TrimSpace(dt.Text())
			dd := dt.Next()
			if goquery.NodeName(dd) == "dd" {
				add(q, strings.TrimSpace(dd.Text()))
			}
		})
	})

	// Pattern 3: Accordion / FAQ components
	faqContainers := []string{
		".faq-item", ".faq-block", ".faq-entry", ".faq-row",
		".accordion-item", ".accordion-panel",
		"[itemtype*='Question']",
		".question-answer", ".qa-item",
	}
	for _, sel := range faqContainers {
		doc.Find(sel).Each(func(_ int, item *goquery.Selection) {
			var q, a string
			for _, qs := range []string{
				".faq-question", ".accordion-header", ".accordion-title",
				".question", "[itemprop='name']", "summary", "h3", "h4",
			} {
				if qe := item.Find(qs).First(); qe.Length() > 0 {
					q = strings.TrimSpace(qe.Text())
					break
				}
			}
			for _, as := range []string{
				".faq-answer", ".accordion-body", ".accordion-content",
				".answer", "[itemprop='text']", ".panel-body", "p",
			} {
				if ae := item.Find(as).First(); ae.Length() > 0 {
					a = strings.TrimSpace(ae.Text())
					break
				}
			}
			add(q, a)
		})
	}

	return faqs
}

// ---------- Content Type Detection ----------

func detectContentType(pageURL string, doc *goquery.Selection, faqs []QAPair) string {
	lower := strings.ToLower(pageURL)

	if len(faqs) >= 2 {
		return "faq"
	}
	if strings.Contains(lower, "/faq") || strings.Contains(lower, "/frequently-asked") ||
		strings.Contains(lower, "/help") || strings.Contains(lower, "/support") {
		return "faq"
	}

	if doc.Find("article").Length() > 0 ||
		strings.Contains(lower, "/blog") || strings.Contains(lower, "/news") ||
		strings.Contains(lower, "/post/") || strings.Contains(lower, "/article/") {
		return "article"
	}

	if strings.Contains(lower, "/product") || strings.Contains(lower, "/shop/") ||
		strings.Contains(lower, "/item/") {
		return "product"
	}
	if doc.Find("[itemprop='price'], .product-price, .price").Length() > 0 {
		return "product"
	}

	return "general"
}

// ---------- Headless Browser Rendering (Rod) ----------

// rodRenderPage renders a single page using headless Chrome and extracts content.
func rodRenderPage(browser *rod.Browser, pageURL string) (*PageContent, error) {
	page, err := browser.Page(proto.TargetCreateTarget{URL: pageURL})
	if err != nil {
		return nil, fmt.Errorf("create tab: %w", err)
	}
	defer page.Close()

	tp := page.Timeout(20 * time.Second)

	// Wait for JS framework to finish rendering
	if err := tp.WaitDOMStable(time.Second, 0.1); err != nil {
		return nil, fmt.Errorf("wait render: %w", err)
	}

	html, err := tp.HTML()
	if err != nil {
		return nil, fmt.Errorf("get HTML: %w", err)
	}

	doc, err := goquery.NewDocumentFromReader(strings.NewReader(html))
	if err != nil {
		return nil, fmt.Errorf("parse HTML: %w", err)
	}

	return extractPageContentFromDoc(doc.Selection, pageURL), nil
}

// rodCrawlPages uses headless Chrome to render and extract content from
// JavaScript-heavy / SPA pages. Called as a fallback when Colly finds no content.
func rodCrawlPages(urls []string, robots *robotstxt.RobotsData) ([]PageContent, int, int) {
	l := launcher.New().Headless(true).Leakless(false)
	controlURL, err := l.Launch()
	if err != nil {
		log.Printf("[crawler] Cannot launch headless browser: %v", err)
		return nil, 0, 0
	}

	browser := rod.New().ControlURL(controlURL).MustConnect()
	defer browser.MustClose()

	maxPages := getMaxPages()
	log.Printf("[crawler] Headless browser launched — rendering %d URLs...", len(urls))

	var pages []PageContent
	var thinCount, errCount int

	for i, u := range urls {
		if len(pages) >= maxPages {
			break
		}
		if shouldSkipURL(u) {
			continue
		}
		if !isAllowedByRobots(robots, u) {
			continue
		}

		content, err := rodRenderPage(browser, u)
		if err != nil {
			errCount++
			log.Printf("[crawler] Rod error on %s: %v", u, err)
			continue
		}

		if content.WordCount < minWordCount {
			thinCount++
			log.Printf("[crawler] Rod thin (%d words): %s", content.WordCount, u)
			continue
		}

		pages = append(pages, *content)
		log.Printf("[crawler] Rod ✓ %d words from %s (%d/%d)", content.WordCount, u, len(pages), i+1)

		// Polite delay between pages
		time.Sleep(300 * time.Millisecond)
	}

	return pages, thinCount, errCount
}

// ---------- Phase 1 Content Filter (Free, No API Calls) ----------

// passesPhaseOneFilter returns false if the page should be skipped.
// It checks word count, password inputs, link density, and stripped body text.
func passesPhaseOneFilter(doc *goquery.Selection, wordCount int) bool {
	// Check 1: Minimum word count
	if wordCount < minWordCount {
		return false
	}

	// Check 2: Password input detection (login/signup pages)
	if doc.Find("input[type='password']").Length() > 0 {
		return false
	}

	// Check 3: Link density — too many links relative to words = navigation page
	linkCount := doc.Find("a").Length()
	if wordCount > 0 && float64(linkCount)/float64(wordCount) > 0.3 {
		return false
	}

	// Check 4: Body text after removing nav/header/footer must have >= 80 words
	bodyCopy := doc.Find("body").Clone()
	bodyCopy.Find("nav, header, footer, aside").Remove()
	strippedText := strings.TrimSpace(bodyCopy.Text())
	if len(strings.Fields(strippedText)) < 80 {
		return false
	}

	return true
}

// ---------- URL Priority Scoring ----------

// scoredURL pairs a URL with its priority score for sorting.
type scoredURL struct {
	URL   string
	Score int
}

// scoreURL scores a discovered URL by content value heuristics.
// Higher scores indicate more valuable content for RAG.
func scoreURL(rawURL string) int {
	lower := strings.ToLower(rawURL)
	parsed, err := url.Parse(lower)
	if err != nil {
		return 0
	}
	path := parsed.Path
	score := 0

	// High value patterns
	for _, kw := range []string{"/faq", "/help", "/support", "/docs", "/documentation"} {
		if strings.Contains(path, kw) {
			score += 100
			break
		}
	}
	for _, kw := range []string{"/pricing", "/plans", "/cost"} {
		if strings.Contains(path, kw) {
			score += 90
			break
		}
	}
	for _, kw := range []string{"/about", "/contact", "/team"} {
		if strings.Contains(path, kw) {
			score += 80
			break
		}
	}
	for _, kw := range []string{"/features", "/product", "/services"} {
		if strings.Contains(path, kw) {
			score += 75
			break
		}
	}
	for _, kw := range []string{"/blog", "/article", "/guide", "/tutorial"} {
		if strings.Contains(path, kw) {
			score += 40
			break
		}
	}

	// Low value patterns
	for _, kw := range []string{"/tag/", "/author/", "/category/", "/archive/"} {
		if strings.Contains(path, kw) {
			score -= 80
			break
		}
	}
	if strings.Contains(path, "/page/") {
		// Pagination like /page/2, /page/3
		score -= 70
	}
	if strings.Contains(lower, "?s=") || strings.Contains(lower, "?search=") {
		score -= 60
	}

	// Path depth penalty
	segments := strings.Split(strings.Trim(path, "/"), "/")
	if len(segments) > 5 {
		score -= 20
	}

	// Shorter paths get a bonus (fewer segments = more likely top-level important page)
	if len(segments) <= 2 && path != "/" {
		score += 10
	}

	return score
}

// ---------- Main Crawl Function ----------

// SmartCrawl performs intelligent website crawling with robots.txt respect,
// sitemap discovery, rate limiting, UA rotation, smart content extraction,
// and FAQ detection. Returns structured pages and a quality report.
func SmartCrawl(baseURL string) (*CrawlResult, error) {
	startTime := time.Now()

	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}
	domain := parsed.Hostname()
	rootDomain := extractRootDomain(domain)

	// Build allowed domain list: exact domain, www variant, and root domain
	allowedDomains := []string{domain}
	if "www."+domain != domain {
		allowedDomains = append(allowedDomains, "www."+domain)
	}
	if rootDomain != domain {
		allowedDomains = append(allowedDomains, rootDomain, "www."+rootDomain)
	}

	log.Printf("[crawler] Allowed domains: %v", allowedDomains)

	maxPages := getMaxPages()

	var (
		mu      sync.Mutex
		pages   []PageContent
		visited = make(map[string]bool)
		report  CrawlReport
		count   atomic.Int32
	)

	// Stage 1: Robots.txt
	robots := fetchRobotsTxt(baseURL)

	// Stage 2: Sitemap discovery
	sitemapURLs := discoverSitemapURLs(baseURL)

	// Stage 3: Configure Colly crawler with rate limiting
	c := colly.NewCollector(
		colly.AllowedDomains(allowedDomains...),
		colly.MaxDepth(4),
		colly.Async(true),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 3,
		Delay:       800 * time.Millisecond,
		RandomDelay: 700 * time.Millisecond,
	})

	c.SetRequestTimeout(30 * time.Second)

	// Request middleware: UA rotation, dedup, robots check
	c.OnRequest(func(r *colly.Request) {
		r.Headers.Set("User-Agent", randomUA())
		r.Headers.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
		r.Headers.Set("Accept-Language", "en-US,en;q=0.9")

		if count.Load() >= int32(maxPages) {
			r.Abort()
			return
		}

		normalized := normalizeURL(r.URL.String())
		mu.Lock()
		if visited[normalized] {
			report.DuplicatesSkipped++
			mu.Unlock()
			r.Abort()
			return
		}
		visited[normalized] = true
		mu.Unlock()

		if shouldSkipURL(r.URL.String()) {
			r.Abort()
			return
		}

		if !isAllowedByRobots(robots, r.URL.String()) {
			mu.Lock()
			report.RobotsTxtBlocked++
			mu.Unlock()
			log.Printf("[crawler] Blocked by robots.txt: %s", r.URL)
			r.Abort()
			return
		}
	})

	// Smart content extraction with Phase 1 filter
	c.OnHTML("html", func(e *colly.HTMLElement) {
		page := extractPageContent(e)

		// Phase 1 content filter (free, no API calls)
		if !passesPhaseOneFilter(e.DOM, page.WordCount) {
			mu.Lock()
			report.ThinContentSkipped++
			mu.Unlock()
			log.Printf("[crawler] Phase 1 filter rejected (%d words): %s", page.WordCount, e.Request.URL)
			return
		}

		mu.Lock()
		pages = append(pages, *page)
		report.FAQsDetected += len(page.FAQs)
		report.TotalWords += page.WordCount
		mu.Unlock()

		count.Add(1)
		log.Printf("[crawler] ✓ Extracted %d words from: %s", page.WordCount, e.Request.URL)
	})

	// BFS link following
	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		if count.Load() >= int32(maxPages) {
			return
		}
		absURL := e.Request.AbsoluteURL(e.Attr("href"))
		if absURL == "" {
			return
		}
		linkParsed, err := url.Parse(absURL)
		if err != nil {
			return
		}
		ld := linkParsed.Hostname()
		ldRoot := extractRootDomain(ld)
		// Allow same domain, subdomain, or root domain
		if ld != domain && ld != "www."+domain && ldRoot != rootDomain {
			return
		}
		if !shouldSkipURL(absURL) {
			e.Request.Visit(absURL)
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		mu.Lock()
		report.ErrorCount++
		mu.Unlock()
		log.Printf("[crawler] Error %d on %s: %v", r.StatusCode, r.Request.URL, err)
	})

	c.OnResponse(func(r *colly.Response) {
		ct := r.Headers.Get("Content-Type")
		if !strings.Contains(ct, "text/html") && !strings.Contains(ct, "application/xhtml") {
			log.Printf("[crawler] Non-HTML response (%s) from: %s", ct, r.Request.URL)
		}
	})

	// Score and prioritize sitemap URLs before seeding
	if len(sitemapURLs) > 0 {
		scored := make([]scoredURL, 0, len(sitemapURLs))
		for _, u := range sitemapURLs {
			s := scoreURL(u)
			if s >= -50 { // Filter out definitely useless URLs
				scored = append(scored, scoredURL{URL: u, Score: s})
			}
		}
		// Sort by score descending
		sort.Slice(scored, func(i, j int) bool {
			return scored[i].Score > scored[j].Score
		})
		// Take top N candidates (maxPages * 3 to give Colly a good pool)
		pool := maxPages * 3
		if pool > len(scored) {
			pool = len(scored)
		}
		scored = scored[:pool]
		log.Printf("[crawler] Prioritized %d/%d sitemap URLs (filtered %d low-score)",
			len(scored), len(sitemapURLs), len(sitemapURLs)-len(scored))
		for _, su := range scored {
			if count.Load() >= int32(maxPages) {
				break
			}
			c.Visit(su.URL)
		}
	}

	// Always visit base URL for BFS discovery
	if err := c.Visit(baseURL); err != nil {
		if len(sitemapURLs) == 0 {
			return nil, fmt.Errorf("failed to start crawl: %w", err)
		}
	}

	c.Wait()

	log.Printf("[crawler] Colly finished: %d pages, %d thin-skipped, %d robots-blocked, %d errors, %d dupes",
		len(pages), report.ThinContentSkipped, report.RobotsTxtBlocked, report.ErrorCount, report.DuplicatesSkipped)

	// If Colly found no usable pages but lots of thin content,
	// the site is likely JavaScript-rendered (SPA). Fall back to headless browser.
	if len(pages) == 0 && report.ThinContentSkipped > 0 {
		log.Printf("[crawler] No content from static HTML (thin=%d) — trying headless browser...",
			report.ThinContentSkipped)

		// Gather URLs: base + sitemap
		rodURLs := []string{baseURL}
		for _, u := range sitemapURLs {
			rodURLs = append(rodURLs, u)
		}

		rodPages, rodThin, rodErrors := rodCrawlPages(rodURLs, robots)
		if len(rodPages) > 0 {
			pages = rodPages
			report.ThinContentSkipped = rodThin
			report.ErrorCount = rodErrors
			report.JSRendered = true
			report.TotalWords = 0
			report.FAQsDetected = 0
			for _, p := range pages {
				report.TotalWords += p.WordCount
				report.FAQsDetected += len(p.FAQs)
			}
			log.Printf("[crawler] Rod recovered %d pages, %d words", len(pages), report.TotalWords)
		}
	}

	if len(pages) == 0 {
		return nil, fmt.Errorf("no pages with sufficient content found at %s (thin=%d, errors=%d, blocked=%d)",
			baseURL, report.ThinContentSkipped, report.ErrorCount, report.RobotsTxtBlocked)
	}

	// Finalize report
	report.PagesCrawled = len(pages)
	if report.PagesCrawled > 0 {
		report.AvgWordsPerPage = report.TotalWords / report.PagesCrawled
	}
	report.CrawlDurationSecs = time.Since(startTime).Seconds()

	log.Printf("[crawler] Complete: %d pages, %d FAQs, %d words in %.1fs",
		report.PagesCrawled, report.FAQsDetected, report.TotalWords, report.CrawlDurationSecs)

	return &CrawlResult{Pages: pages, Report: report}, nil
}

// ComposeRawContent builds a storable text from a PageContent,
// embedding FAQ markers that the smart chunker can parse later.
func ComposeRawContent(page PageContent) string {
	var b strings.Builder
	b.WriteString(page.MainContent)

	if len(page.FAQs) > 0 {
		b.WriteString("\n\n---FAQ---\n")
		for _, faq := range page.FAQs {
			fmt.Fprintf(&b, "Q: %s\nA: %s\n\n", faq.Question, faq.Answer)
		}
	}

	return strings.TrimSpace(b.String())
}

// cleanText normalizes whitespace and removes excessive blank lines.
func cleanText(s string) string {
	lines := strings.Split(s, "\n")
	var cleaned []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}
