package service

import (
	"fmt"
	"strings"
)

// TextChunk represents a chunk of text ready for embedding.
type TextChunk struct {
	Index   int    `json:"index"`
	Content string `json:"content"`
	Type    string `json:"type,omitempty"`   // "faq", "heading-section", "text"
	Source  string `json:"source,omitempty"` // source URL or filename
}

// SmartChunkText intelligently chunks stored document text that may contain
// FAQ markers (Q:/A: pairs after ---FAQ---) and heading markers (## headings).
// The page title is prepended to each chunk for context.
func SmartChunkText(title, text string, maxWords, overlapWords int) []TextChunk {
	if maxWords <= 0 {
		maxWords = 400
	}
	if overlapWords <= 0 {
		overlapWords = 50
	}

	prefix := ""
	if title != "" {
		prefix = title + " — "
	}

	var chunks []TextChunk
	idx := 0

	// Split off FAQ section if present
	mainText := text
	faqText := ""
	if marker := strings.Index(text, "\n---FAQ---\n"); marker != -1 {
		mainText = text[:marker]
		faqText = text[marker+len("\n---FAQ---\n"):]
	}

	// Parse FAQ pairs → one chunk each (never split Q&A)
	if faqText != "" {
		pairs := parseFAQPairs(faqText)
		for _, pair := range pairs {
			content := fmt.Sprintf("%sQ: %s\nA: %s", prefix, pair.Question, pair.Answer)
			chunks = append(chunks, TextChunk{
				Index:   idx,
				Content: content,
				Type:    "faq",
			})
			idx++
		}
	}

	// Split main content by heading boundaries
	sections := splitByHeadings(mainText)

	for _, section := range sections {
		content := prefix + section
		words := strings.Fields(content)
		if len(words) == 0 {
			continue
		}

		// Small section → single chunk
		if len(words) <= maxWords {
			chunks = append(chunks, TextChunk{
				Index:   idx,
				Content: strings.Join(words, " "),
				Type:    "heading-section",
			})
			idx++
			continue
		}

		// Large section → split with overlap
		start := 0
		for start < len(words) {
			end := start + maxWords
			if end > len(words) {
				end = len(words)
			}
			chunks = append(chunks, TextChunk{
				Index:   idx,
				Content: strings.Join(words[start:end], " "),
				Type:    "text",
			})
			idx++
			start += maxWords - overlapWords
			if start >= len(words) {
				break
			}
		}
	}

	// Fallback: if no chunks created, use entire content
	if len(chunks) == 0 && text != "" {
		chunks = append(chunks, TextChunk{
			Index:   0,
			Content: prefix + text,
			Type:    "text",
		})
	}

	return chunks
}

// splitByHeadings splits text at markdown-style heading markers (# and ##).
func splitByHeadings(text string) []string {
	if text == "" {
		return nil
	}

	lines := strings.Split(text, "\n")
	var sections []string
	var current strings.Builder

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)

		// H1 or H2 boundary → flush current section
		if (strings.HasPrefix(trimmed, "## ") || strings.HasPrefix(trimmed, "# ")) && current.Len() > 0 {
			sec := strings.TrimSpace(current.String())
			if sec != "" {
				sections = append(sections, sec)
			}
			current.Reset()
		}

		if trimmed != "" {
			current.WriteString(trimmed)
			current.WriteString("\n")
		}
	}

	if current.Len() > 0 {
		sec := strings.TrimSpace(current.String())
		if sec != "" {
			sections = append(sections, sec)
		}
	}

	if len(sections) == 0 && text != "" {
		return []string{strings.TrimSpace(text)}
	}

	return sections
}

// parseFAQPairs extracts Q:/A: pairs from FAQ-section text.
func parseFAQPairs(text string) []QAPair {
	var pairs []QAPair
	lines := strings.Split(text, "\n")

	var currentQ, currentA string
	inAnswer := false

	flush := func() {
		q := strings.TrimSpace(currentQ)
		a := strings.TrimSpace(currentA)
		if q != "" && a != "" {
			pairs = append(pairs, QAPair{Question: q, Answer: a})
		}
		currentQ = ""
		currentA = ""
		inAnswer = false
	}

	for _, line := range lines {
		line = strings.TrimSpace(line)

		if line == "" {
			if currentQ != "" && currentA != "" {
				flush()
			}
			continue
		}

		if strings.HasPrefix(line, "Q: ") {
			if currentQ != "" {
				flush()
			}
			currentQ = strings.TrimPrefix(line, "Q: ")
			inAnswer = false
		} else if strings.HasPrefix(line, "A: ") {
			currentA = strings.TrimPrefix(line, "A: ")
			inAnswer = true
		} else if inAnswer {
			currentA += " " + line
		}
	}

	flush()
	return pairs
}

// ChunkText is the legacy chunker for uploaded documents (non-crawled content).
// It splits text into ~targetWords-word chunks with overlapWords overlap.
func ChunkText(text string, targetWords, overlapWords int) []TextChunk {
	if targetWords <= 0 {
		targetWords = 400
	}
	if overlapWords <= 0 {
		overlapWords = 50
	}

	words := strings.Fields(text)
	if len(words) == 0 {
		return nil
	}

	if len(words) <= targetWords {
		return []TextChunk{
			{Index: 0, Content: strings.Join(words, " "), Type: "text"},
		}
	}

	var chunks []TextChunk
	start := 0
	index := 0

	for start < len(words) {
		end := start + targetWords
		if end > len(words) {
			end = len(words)
		}

		chunks = append(chunks, TextChunk{
			Index:   index,
			Content: strings.Join(words[start:end], " "),
			Type:    "text",
		})

		start += targetWords - overlapWords
		if start >= len(words) {
			break
		}
		index++
	}

	return chunks
}
