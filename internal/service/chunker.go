package service

import "strings"

// TextChunk represents a chunk of text from a document.
type TextChunk struct {
	Index   int    `json:"index"`
	Content string `json:"content"`
}

// ChunkText splits text into chunks of approximately targetWords words
// with an overlap of overlapWords. This ensures no context is lost
// at chunk boundaries.
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

	// If text is small enough, return as single chunk
	if len(words) <= targetWords {
		return []TextChunk{
			{Index: 0, Content: strings.Join(words, " ")},
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

		chunk := strings.Join(words[start:end], " ")
		chunks = append(chunks, TextChunk{
			Index:   index,
			Content: chunk,
		})

		// Move window forward by (targetWords - overlap) to create overlap
		start += targetWords - overlapWords
		if start >= len(words) {
			break
		}
		index++
	}

	return chunks
}
