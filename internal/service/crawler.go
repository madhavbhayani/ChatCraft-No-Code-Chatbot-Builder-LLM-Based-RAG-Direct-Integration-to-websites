package service

import (
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"

	"github.com/gocolly/colly/v2"
)

// CrawledPage holds the extracted content from a single page.
type CrawledPage struct {
	URL     string `json:"url"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

// CrawlWebsite crawls the given base URL (including subdomains) and extracts
// text content from every reachable page. It respects same-domain boundaries.
func CrawlWebsite(baseURL string) ([]CrawledPage, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return nil, fmt.Errorf("invalid URL: %w", err)
	}

	// Allow the exact domain and any subdomain
	domain := parsed.Hostname()

	var mu sync.Mutex
	var pages []CrawledPage

	c := colly.NewCollector(
		colly.AllowedDomains(domain, "www."+domain),
		colly.MaxDepth(3),
		colly.Async(true),
	)

	c.Limit(&colly.LimitRule{
		DomainGlob:  "*",
		Parallelism: 4,
	})

	// On every HTML page, extract text
	c.OnHTML("html", func(e *colly.HTMLElement) {
		title := e.ChildText("title")

		// Remove script, style, nav, footer, header elements before extracting text
		e.DOM.Find("script, style, nav, footer, header, noscript, iframe, svg").Remove()

		// Extract text from body
		bodyText := e.DOM.Find("body").Text()
		bodyText = cleanText(bodyText)

		if bodyText == "" {
			return
		}

		mu.Lock()
		pages = append(pages, CrawledPage{
			URL:     e.Request.URL.String(),
			Title:   strings.TrimSpace(title),
			Content: bodyText,
		})
		mu.Unlock()
	})

	// Follow links on the same domain
	c.OnHTML("a[href]", func(e *colly.HTMLElement) {
		link := e.Attr("href")
		absoluteURL := e.Request.AbsoluteURL(link)
		if absoluteURL == "" {
			return
		}

		linkParsed, err := url.Parse(absoluteURL)
		if err != nil {
			return
		}

		// Only follow same-domain links
		linkDomain := linkParsed.Hostname()
		if linkDomain == domain || linkDomain == "www."+domain || strings.HasSuffix(linkDomain, "."+domain) {
			// Skip non-page resources
			lower := strings.ToLower(absoluteURL)
			skipExts := []string{".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".css", ".js", ".zip", ".mp4", ".mp3"}
			for _, ext := range skipExts {
				if strings.HasSuffix(lower, ext) {
					return
				}
			}
			e.Request.Visit(absoluteURL)
		}
	})

	c.OnError(func(r *colly.Response, err error) {
		log.Printf("[crawler] error on %s: %v", r.Request.URL, err)
	})

	if err := c.Visit(baseURL); err != nil {
		return nil, fmt.Errorf("failed to start crawl: %w", err)
	}

	c.Wait()

	if len(pages) == 0 {
		return nil, fmt.Errorf("no pages found at %s", baseURL)
	}

	return pages, nil
}

// cleanText normalizes whitespace and removes excessive blank lines.
func cleanText(s string) string {
	// Replace tabs and multiple spaces with single space
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
