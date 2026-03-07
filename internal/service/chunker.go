package service

import (
	"fmt"
	"strings"
)

// TextChunk represents a single embeddable piece of content.
type TextChunk struct {
	Index          int    `json:"index"`
	Content        string `json:"content"`
	PageTitle      string `json:"page_title"`
	SectionHeading string `json:"section_heading"`
	Type           string `json:"type,omitempty"`   // "faq" | "paragraph" | "text" | "fallback"
	Source         string `json:"source,omitempty"` // source URL or filename
	WordCount      int    `json:"word_count"`
}

// Paragraph represents a block of text with its nearest section heading.
type Paragraph struct {
	Heading string
	Text    string
}

// StripNavigationNoise removes common UI/navigation text lines from
// raw crawled content before chunking.
func StripNavigationNoise(text string) string {
	lines := strings.Split(text, "\n")
	var cleaned []string

	noisePatterns := []string{
		"skip to", "back to top", "read more", "learn more",
		"click here", "all rights reserved", "privacy policy",
		"terms of service", "cookie policy", "terms and conditions",
		"© ", "copyright ", "sign up", "log in", "log out",
		"subscribe", "follow us", "share this",
	}

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			cleaned = append(cleaned, "")
			continue
		}

		words := strings.Fields(trimmed)

		// Too short to be content
		if len(words) < 5 {
			continue
		}

		// Matches a noise pattern (only skip if line is short)
		lower := strings.ToLower(trimmed)
		isNoise := false
		for _, pattern := range noisePatterns {
			if strings.Contains(lower, pattern) && len(words) < 15 {
				isNoise = true
				break
			}
		}
		if isNoise {
			continue
		}

		// Line is only a URL
		if len(words) == 1 && (strings.HasPrefix(trimmed, "http://") ||
			strings.HasPrefix(trimmed, "https://")) {
			continue
		}

		cleaned = append(cleaned, line)
	}

	return strings.Join(cleaned, "\n")
}

// SplitIntoParagraphs splits text into semantic paragraph blocks,
// tracking which heading each paragraph falls under.
func SplitIntoParagraphs(text string) []Paragraph {
	// Normalize: collapse 3+ blank lines into 2
	for strings.Contains(text, "\n\n\n") {
		text = strings.ReplaceAll(text, "\n\n\n", "\n\n")
	}

	blocks := strings.Split(text, "\n\n")
	var paragraphs []Paragraph
	currentHeading := ""

	for _, block := range blocks {
		block = strings.TrimSpace(block)
		if block == "" {
			continue
		}

		firstLine := strings.SplitN(block, "\n", 2)[0]
		trimFirst := strings.TrimSpace(firstLine)

		if strings.HasPrefix(trimFirst, "# ") {
			currentHeading = strings.TrimPrefix(trimFirst, "# ")
			rest := strings.TrimSpace(strings.TrimPrefix(block, firstLine))
			if rest != "" {
				paragraphs = append(paragraphs, Paragraph{
					Heading: currentHeading,
					Text:    rest,
				})
			}
		} else if strings.HasPrefix(trimFirst, "## ") {
			currentHeading = strings.TrimPrefix(trimFirst, "## ")
			rest := strings.TrimSpace(strings.TrimPrefix(block, firstLine))
			if rest != "" {
				paragraphs = append(paragraphs, Paragraph{
					Heading: currentHeading,
					Text:    rest,
				})
			}
		} else if strings.HasPrefix(trimFirst, "### ") ||
			strings.HasPrefix(trimFirst, "#### ") {
			subHeading := strings.TrimLeft(trimFirst, "# ")
			rest := strings.TrimSpace(strings.TrimPrefix(block, firstLine))
			content := subHeading
			if rest != "" {
				content = subHeading + "\n" + rest
			}
			paragraphs = append(paragraphs, Paragraph{
				Heading: currentHeading,
				Text:    content,
			})
		} else {
			paragraphs = append(paragraphs, Paragraph{
				Heading: currentHeading,
				Text:    block,
			})
		}
	}

	return paragraphs
}

// SmartChunkText intelligently chunks document text using paragraph boundaries,
// navigation noise stripping, paragraph merging, and minimum size enforcement.
//
// Key features:
//  1. Strips navigation noise before processing
//  2. Splits by paragraph boundaries (meaningful) not just headings
//  3. Merges small adjacent paragraphs (reduces chunk count)
//  4. Enforces minimum 50-word size (discards noise chunks)
//  5. Self-contained header in every chunk (improves RAG accuracy)
//  6. Returns word count per chunk
func SmartChunkText(title, text string, maxWords, overlapWords int) []TextChunk {
	if maxWords <= 0 {
		maxWords = 300
	}
	if overlapWords <= 0 {
		overlapWords = 40
	}
	const minWords = 50

	var chunks []TextChunk
	idx := 0

	// STEP 1: Strip navigation noise
	text = StripNavigationNoise(text)

	// STEP 2: Separate FAQ section
	mainText := text
	faqText := ""
	if marker := strings.Index(text, "\n---FAQ---\n"); marker != -1 {
		mainText = text[:marker]
		faqText = text[marker+len("\n---FAQ---\n"):]
	}

	// STEP 3: Process FAQ pairs (unchanged — this logic works correctly)
	if faqText != "" {
		pairs := parseFAQPairs(faqText)
		for _, pair := range pairs {
			content := fmt.Sprintf("%s > FAQ\nQ: %s\nA: %s",
				title, pair.Question, pair.Answer)
			wc := len(strings.Fields(content))
			if pair.Answer == "" {
				continue
			}
			chunks = append(chunks, TextChunk{
				Index:          idx,
				Content:        content,
				PageTitle:      title,
				SectionHeading: "FAQ",
				Type:           "faq",
				WordCount:      wc,
			})
			idx++
		}
	}

	// STEP 4: Split main text into paragraphs
	paragraphs := SplitIntoParagraphs(mainText)
	if len(paragraphs) == 0 {
		if wc := len(strings.Fields(mainText)); wc >= minWords {
			content := title + "\n" + strings.TrimSpace(mainText)
			chunks = append(chunks, TextChunk{
				Index:     idx,
				Content:   content,
				PageTitle: title,
				Type:      "fallback",
				WordCount: wc,
			})
		}
		return chunks
	}

	// STEP 5 + 6: Merge paragraphs into chunks grouped by heading
	type paragraphGroup struct {
		heading string
		lines   []string
		words   int
	}

	flushGroup := func(group paragraphGroup) {
		if group.words < minWords {
			return
		}

		header := title
		if group.heading != "" {
			header = title + " > " + group.heading
		}

		content := header + "\n" + strings.Join(group.lines, "\n\n")
		content = strings.TrimSpace(content)

		wc := len(strings.Fields(content))
		if wc < minWords {
			return
		}

		chunks = append(chunks, TextChunk{
			Index:          idx,
			Content:        content,
			PageTitle:      title,
			SectionHeading: group.heading,
			Type:           "paragraph",
			WordCount:      wc,
		})
		idx++
	}

	current := paragraphGroup{}

	for _, para := range paragraphs {
		paraWords := len(strings.Fields(para.Text))
		if paraWords == 0 {
			continue
		}

		// Heading changed → flush current group, start new one
		if para.Heading != current.heading && len(current.lines) > 0 {
			flushGroup(current)
			current = paragraphGroup{heading: para.Heading}
		}

		// Single paragraph larger than maxWords → split it
		if paraWords > maxWords {
			if len(current.lines) > 0 {
				flushGroup(current)
				current = paragraphGroup{heading: para.Heading}
			}
			subChunks := splitLargeParagraph(
				title, para.Heading, para.Text, maxWords, overlapWords, &idx)
			chunks = append(chunks, subChunks...)
			continue
		}

		// Adding this paragraph would exceed maxWords → flush first
		if current.words+paraWords > maxWords && len(current.lines) > 0 {
			flushGroup(current)
			current = paragraphGroup{heading: para.Heading}
		}

		current.heading = para.Heading
		current.lines = append(current.lines, para.Text)
		current.words += paraWords
	}

	// Flush final group
	if len(current.lines) > 0 {
		flushGroup(current)
	}

	return chunks
}

// splitLargeParagraph handles the edge case where a single paragraph
// is larger than maxWords. It splits by word boundaries with overlap,
// preserving the self-contained header on every sub-chunk.
func splitLargeParagraph(title, heading, text string, maxWords, overlapWords int, idx *int) []TextChunk {
	const minWords = 50

	header := title
	if heading != "" {
		header = title + " > " + heading
	}

	words := strings.Fields(text)
	var chunks []TextChunk
	start := 0

	for start < len(words) {
		end := start + maxWords
		if end > len(words) {
			end = len(words)
		}

		// Don't create a tiny tail chunk — merge into previous
		if end-start < minWords && start > 0 {
			if len(chunks) > 0 {
				chunks[len(chunks)-1].Content += " " + strings.Join(words[start:end], " ")
				chunks[len(chunks)-1].WordCount += end - start
			}
			break
		}

		content := header + "\n" + strings.Join(words[start:end], " ")
		chunks = append(chunks, TextChunk{
			Index:          *idx,
			Content:        content,
			PageTitle:      title,
			SectionHeading: heading,
			Type:           "text",
			WordCount:      len(strings.Fields(content)),
		})
		*idx++

		start += maxWords - overlapWords
		if start >= len(words) {
			break
		}
	}

	return chunks
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
