package service

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
)

// SubdomainResult holds a discovered subdomain with its status.
type SubdomainResult struct {
	Subdomain    string `json:"subdomain"`
	FullURL      string `json:"full_url"`
	IsLive       bool   `json:"is_live"`
	Priority     string `json:"priority"`      // "high", "medium", "low"
	Category     string `json:"category"`       // "docs", "help", "blog", "api", "cdn", etc.
	Recommended  bool   `json:"recommended"`
	AutoSelected bool   `json:"auto_selected"`
}

// DiscoverSubdomainsResult is the response from subdomain discovery.
type DiscoverSubdomainsResult struct {
	Domain     string            `json:"domain"`
	Subdomains []SubdomainResult `json:"subdomains"`
	MainSite   SubdomainResult   `json:"main_site"`
}

// crtEntry is a single row from crt.sh JSON output.
type crtEntry struct {
	NameValue string `json:"name_value"`
}

// highValuePrefixes indicate subdomains likely to have useful content.
var highValuePrefixes = []string{
	"docs", "doc", "documentation",
	"help", "helpdesk", "helpcenter",
	"support", "kb", "knowledgebase", "knowledge",
	"faq", "faqs",
	"learn", "academy", "education", "training",
	"guide", "guides", "tutorial", "tutorials",
	"wiki", "community", "forum", "forums",
	"blog", "news", "updates",
	"www",
}

// lowValuePrefixes indicate subdomains unlikely to have useful text.
var lowValuePrefixes = []string{
	"api", "api-docs",
	"cdn", "static", "assets", "media", "img", "images",
	"mail", "email", "smtp", "imap", "pop",
	"ftp", "sftp",
	"admin", "dashboard", "console", "panel",
	"staging", "stage", "dev", "test", "qa", "sandbox", "demo",
	"ci", "cd", "jenkins", "gitlab", "github",
	"monitoring", "grafana", "prometheus", "kibana",
	"vpn", "proxy", "gateway",
	"ns1", "ns2", "ns3", "ns4", "dns",
	"mx", "mx1", "mx2",
	"autodiscover", "autoconfig",
	"cpanel", "webmail", "whm",
	"status",
}

// wildcardPattern matches wildcard crt.sh entries like *.example.com
var wildcardPattern = regexp.MustCompile(`^\*\.`)

// DiscoverSubdomains queries crt.sh for subdomains of the given domain,
// validates them via DNS, and classifies their content value.
func DiscoverSubdomains(domain string) (*DiscoverSubdomainsResult, error) {
	domain = strings.TrimSpace(domain)
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")
	domain = strings.ToLower(domain)

	// Strip www. prefix if present to get root domain
	if strings.HasPrefix(domain, "www.") {
		domain = domain[4:]
	}

	log.Printf("[subdomain] Discovering subdomains for: %s", domain)

	// 1. Query crt.sh for certificate transparency logs
	subdomains, err := queryCrtSh(domain)
	if err != nil {
		log.Printf("[subdomain] crt.sh query failed: %v, falling back to common prefixes", err)
		subdomains = generateCommonSubdomains(domain)
	}

	// Always include the main domain and www
	subdomains = ensurePresent(subdomains, domain)
	subdomains = ensurePresent(subdomains, "www."+domain)

	// Deduplicate
	subdomains = deduplicate(subdomains)

	log.Printf("[subdomain] Found %d unique subdomains, validating DNS...", len(subdomains))

	// 2. DNS validation + classification
	results := make([]SubdomainResult, 0, len(subdomains))
	var mainSite SubdomainResult

	for _, sub := range subdomains {
		result := classifySubdomain(sub, domain)

		// Check DNS
		result.IsLive = checkDNS(sub)

		if sub == domain || sub == "www."+domain {
			if sub == domain {
				mainSite = result
				mainSite.Recommended = true
				mainSite.AutoSelected = true
				mainSite.Priority = "high"
				mainSite.Category = "main"
			}
			// www is always recommended
			result.Recommended = true
			result.AutoSelected = true
		}

		results = append(results, result)
	}

	// Sort: live first, then by priority (high > medium > low), then alphabetical
	sort.Slice(results, func(i, j int) bool {
		if results[i].IsLive != results[j].IsLive {
			return results[i].IsLive
		}
		pi := priorityRank(results[i].Priority)
		pj := priorityRank(results[j].Priority)
		if pi != pj {
			return pi < pj
		}
		return results[i].Subdomain < results[j].Subdomain
	})

	// If main site wasn't in the list, create it
	if mainSite.Subdomain == "" {
		mainSite = SubdomainResult{
			Subdomain:    domain,
			FullURL:      "https://" + domain,
			IsLive:       checkDNS(domain),
			Priority:     "high",
			Category:     "main",
			Recommended:  true,
			AutoSelected: true,
		}
	}

	log.Printf("[subdomain] Discovery complete: %d subdomains found, %d live",
		len(results), countLive(results))

	return &DiscoverSubdomainsResult{
		Domain:     domain,
		Subdomains: results,
		MainSite:   mainSite,
	}, nil
}

// queryCrtSh queries Certificate Transparency logs via crt.sh.
func queryCrtSh(domain string) ([]string, error) {
	url := fmt.Sprintf("https://crt.sh/?q=%%.%s&output=json", domain)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("crt.sh request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("crt.sh returned status %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024)) // 5MB limit
	if err != nil {
		return nil, fmt.Errorf("reading crt.sh response: %w", err)
	}

	var entries []crtEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil, fmt.Errorf("parsing crt.sh JSON: %w", err)
	}

	seen := make(map[string]bool)
	var subdomains []string

	for _, e := range entries {
		// name_value can contain multiple domains separated by newlines
		for _, name := range strings.Split(e.NameValue, "\n") {
			name = strings.TrimSpace(strings.ToLower(name))
			if name == "" {
				continue
			}
			// Remove wildcard prefix
			name = wildcardPattern.ReplaceAllString(name, "")
			if name == "" {
				continue
			}
			// Must end with the domain
			if !strings.HasSuffix(name, domain) {
				continue
			}
			if !seen[name] {
				seen[name] = true
				subdomains = append(subdomains, name)
			}
		}
	}

	return subdomains, nil
}

// generateCommonSubdomains creates a list of common subdomain prefixes to check.
func generateCommonSubdomains(domain string) []string {
	commonPrefixes := []string{
		"www", "docs", "help", "support", "blog", "api", "kb",
		"learn", "community", "forum", "faq", "wiki", "guide",
	}
	var subs []string
	for _, prefix := range commonPrefixes {
		subs = append(subs, prefix+"."+domain)
	}
	return subs
}

// classifySubdomain determines the priority and category of a subdomain.
func classifySubdomain(subdomain, rootDomain string) SubdomainResult {
	prefix := strings.TrimSuffix(subdomain, "."+rootDomain)
	if prefix == subdomain {
		prefix = "" // it's the root domain itself
	}

	result := SubdomainResult{
		Subdomain: subdomain,
		FullURL:   "https://" + subdomain,
		Priority:  "medium",
		Category:  "other",
	}

	prefixLower := strings.ToLower(prefix)

	// Check high-value prefixes
	for _, hp := range highValuePrefixes {
		if prefixLower == hp || strings.HasPrefix(prefixLower, hp+".") || strings.HasPrefix(prefixLower, hp+"-") {
			result.Priority = "high"
			result.Category = hp
			result.Recommended = true
			result.AutoSelected = true
			return result
		}
	}

	// Check low-value prefixes
	for _, lp := range lowValuePrefixes {
		if prefixLower == lp || strings.HasPrefix(prefixLower, lp+".") || strings.HasPrefix(prefixLower, lp+"-") {
			result.Priority = "low"
			result.Category = lp
			result.Recommended = false
			result.AutoSelected = false
			return result
		}
	}

	return result
}

// checkDNS verifies if a subdomain resolves via DNS.
func checkDNS(subdomain string) bool {
	addrs, err := net.LookupHost(subdomain)
	return err == nil && len(addrs) > 0
}

func ensurePresent(list []string, item string) []string {
	for _, s := range list {
		if s == item {
			return list
		}
	}
	return append(list, item)
}

func deduplicate(list []string) []string {
	seen := make(map[string]bool)
	var result []string
	for _, s := range list {
		if !seen[s] {
			seen[s] = true
			result = append(result, s)
		}
	}
	return result
}

func priorityRank(p string) int {
	switch p {
	case "high":
		return 0
	case "medium":
		return 1
	case "low":
		return 2
	default:
		return 3
	}
}

func countLive(results []SubdomainResult) int {
	count := 0
	for _, r := range results {
		if r.IsLive {
			count++
		}
	}
	return count
}
