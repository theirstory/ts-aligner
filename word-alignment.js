/**
 * ============================================================================
 * TRANSCRIPT ALIGNMENT ALGORITHM
 * Version: 0.2.2
 * ============================================================================
 * 
 * PURPOSE:
 * Align a machine-generated transcript (with timing data) with a human-corrected
 * transcript (without timing data) to produce a corrected transcript with accurate
 * timing information.
 * 
 * INTERNAL FORMAT: JSON
 * All algorithms work with JSON format internally. Use conversion.js for HTML.
 * 
 * PROBLEM STATEMENT:
 * - Machine transcription (e.g., from speech-to-video) produces word-level timings
 *   but often contains transcription errors (wrong words, missing words, extra words)
 * - Human editors correct the transcript text but lose the timing data
 * - We need to transfer timing data from machine transcript to corrected transcript
 * 
 * SOLUTION OVERVIEW:
 * Use edit distance (Levenshtein distance) algorithm to align the two transcripts
 * word-by-word, then transfer timings based on the alignment.
 * 
 * JSON FORMAT:
 * {
 *   "words": [
 *     {"start": 4.76, "end": 5.28, "text": "word"},
 *     ...
 *   ],
 *   "paragraphs": [
 *     {"speaker": "Name", "start": 4.76, "end": 10.0},
 *     ...
 *   ]
 * }
 * - Times in seconds (floating point)
 * - Paragraphs are optional
 * - Speaker labels are optional
 * 
 * PLAIN TEXT FORMAT (for corrected transcripts):
 * [Alice]: I believe we should...
 * Bob: Yes, I agree completely.
 * Dr. Johnson: Excellent point.
 * Smith-Jones: Let me add something.
 * - Paragraphs separated by one or more newlines
 * - Optional speaker labels (bracketed or unbracketed)
 * - Colon (:) used as separator for unbracketed speakers
 * - Names can contain periods and dashes (Dr. Johnson, Smith-Jones)
 * - Speaker text must start with capital letter
 * 
 * ALGORITHM FLOW:
 * 
 * 1. EXTRACT phase:
 *    - Parse machine JSON to extract words and timings
 *    - Parse corrected text to extract words (without speaker labels)
 *    
 * 2. ALIGN phase:
 *    - Use dynamic programming edit distance to align word sequences
 *    - Identify matches, substitutions, insertions, deletions
 *    
 * 3. TRANSFER phase:
 *    - For matched/substituted words: use original timing
 *    - For inserted words: interpolate timing from nearby words
 *    - For deleted words: skip (don't appear in output)
 *    
 * 4. RECONSTRUCT phase:
 *    - Detect paragraph structure from corrected text
 *    - Generate JSON with proper structure
 *    - Attach timing data to each word
 * 
 * KEY FEATURES:
 * - Handles word substitutions (corrections)
 * - Handles insertions (words added by editor)
 * - Handles deletions (words removed by editor)
 * - Preserves paragraph structure
 * - Preserves speaker labels
 * - Case-insensitive word matching
 * - Punctuation-aware alignment
 * 
 * LIMITATIONS:
 * - Inserted words borrow timing from adjacent words (not perfectly accurate)
 * - Large-scale restructuring may not align well
 * - Assumes words are mostly in the same order
 * 
 * CHANGELOG:
 * v0.2.2 - Removed escaped newline preprocessing (moved to Transcript Preprocessor)
 *          Improved banded alignment with typed arrays for memory efficiency
 *          Increased bandwidth to 4000 for long transcripts (~2GB memory)
 * v0.2.1 - Added preprocessing to convert escaped newlines (\\n) to actual newlines
 * v0.2.0 - Fixed word matching to use normalizeWord() instead of toLowerCase()
 *          This ensures punctuation differences don't cause misalignment
 *          (e.g., "recording." now correctly matches "recording")
 * 
 * ============================================================================
 */

/**
 * HELPER FUNCTION: stripPunctuation
 * 
 * PURPOSE: Remove trailing punctuation from a word for better matching
 * 
 * WHY: Machine transcripts and corrected transcripts may differ in punctuation.
 *      "hello," and "hello" should be considered the same word for alignment.
 * 
 * INPUTS:
 *   - word: A string representing a single word (may have punctuation)
 * 
 * OUTPUTS:
 *   - The word with trailing punctuation removed
 * 
 * EXAMPLES:
 *   stripPunctuation("hello,") → "hello"
 *   stripPunctuation("world!") → "world"
 *   stripPunctuation("okay.") → "okay"
 */
function stripPunctuation(word) {
  // Remove one or more trailing punctuation characters: .,!?;:'"
  // The + means "one or more", $ means "at the end of string"
  return word.replace(/[.,!?;:'"]+$/, '');
}

/**
 * HELPER FUNCTION: normalizeWord
 * 
 * PURPOSE: Normalize a word for comparison during alignment
 * 
 * WHY: Words should match regardless of case or punctuation differences.
 *      "Hello," and "hello" should be treated as the same word.
 * 
 * INPUTS:
 *   - word: A string representing a single word
 * 
 * OUTPUTS:
 *   - Lowercase word with trailing punctuation removed
 * 
 * PROCESS:
 *   1. Strip trailing punctuation
 *   2. Convert to lowercase
 * 
 * EXAMPLES:
 *   normalizeWord("Hello,") → "hello"
 *   normalizeWord("WORLD!") → "world"
 */
function normalizeWord(word) {
  return stripPunctuation(word.toLowerCase());
}

/**
 * FUNCTION: extractWordsFromJSON
 * 
 * PURPOSE: Extract words and timing data from JSON transcript
 * 
 * INPUTS:
 *   - jsonData: JSON object with structure {words: [...], paragraphs: [...]}
 * 
 * OUTPUTS:
 *   - Object containing:
 *     * words: Array of word text strings
 *     * timings: Array of timing objects {start, end} in seconds
 * 
 * PROCESS:
 *   1. Extract word text from JSON words array
 *   2. Extract timing information (already in seconds)
 *   3. Filter out empty words
 */
function extractWordsFromJSON(jsonData) {
  const words = [];
  const timings = [];
  
  // Process each word in the JSON data
  (jsonData.words || []).forEach(word => {
    // Skip empty words
    if (word.text && word.text.trim()) {
      words.push(word.text.trim());
      
      // Store timing in seconds (as provided in JSON)
      timings.push({
        start: word.start,
        end: word.end
      });
    }
  });
  
  return { words, timings };
}

/**
 * FUNCTION: extractWordsFromPlainText
 * 
 * PURPOSE: Extract just the words from corrected transcript, excluding speaker labels
 * 
 * WHY: We need a clean word array for alignment that matches the structure
 *      of the machine transcript. Speaker labels are metadata, not actual spoken words.
 * 
 * INPUTS:
 *   - plainText: Corrected transcript as plain text (may include speaker labels)
 * 
 * OUTPUTS:
 *   - Array of words (strings) without any speaker labels
 * 
 * EXAMPLE INPUT:
 *   "[Alice]: Hello there.\nBob - How are you?"
 * 
 * EXAMPLE OUTPUT:
 *   ["Hello", "there.", "How", "are", "you?"]
 *   // Note: "Alice" and "Bob" are NOT included
 * 
 * PROCESS:
 *   1. Split text by one or more newlines to get paragraphs
 *   2. For each paragraph:
 *      a. Validate and remove speaker label if present (bracketed or unbracketed)
 *      b. Split remaining text into words
 *   3. Concatenate all words into a single array
 */
function extractWordsFromPlainText(plainText) {
  // Split by one or more newlines to get individual paragraphs
  const paragraphs = plainText.split(/\n+/);
  
  // Accumulator for all words across all paragraphs
  let allWords = [];
  
  // Process each paragraph
  paragraphs.forEach(paragraph => {
    const trimmedParagraph = paragraph.trim();
    
    if (trimmedParagraph.length > 0) {
      // Use the validation function to check for speaker and get remaining text
      const validation = isValidSpeakerPattern(trimmedParagraph);
      
      let paragraphText = trimmedParagraph;
      
      // If valid speaker pattern detected, use the remaining text
      if (validation.isValid) {
        paragraphText = validation.remainingText;
      }
      
      // Split into words by whitespace, filter out empty strings
      const words = paragraphText.split(/\s+/).filter(w => w.length > 0);
      
      // Add this paragraph's words to the master list
      allWords = allWords.concat(words);
    }
  });
  
  return allWords;
}

/**
 * HELPER FUNCTION: isValidSpeakerPattern
 * 
 * PURPOSE: Validate that a potential speaker label follows the correct pattern
 * 
 * WHY: We need to distinguish actual speaker labels from regular text.
 *      This is a permissive, language-agnostic approach.
 *      Valid patterns:
 *      - [anything]: text (bracketed, optionally with colon)
 *      - [anything] text (bracketed without colon)
 *      - anything: text (unbracketed with colon)
 * 
 * INPUTS:
 *   - text: The paragraph text to check
 * 
 * OUTPUTS:
 *   - Object with {isValid: boolean, speaker: string|null, remainingText: string}
 * 
 * VALIDATION RULES:
 *   1. Bracketed: [text] followed by any content
 *   2. Unbracketed: text followed by : and any content
 *   3. No case requirements - language agnostic
 *   4. Speaker can be any text (names, notes, labels, etc.)
 * 
 * EXAMPLES:
 *   "[Alice]: Hello there" → {isValid: true, speaker: "Alice"}
 *   "[note] something" → {isValid: true, speaker: "note"}
 *   "Alice: so do I." → {isValid: true, speaker: "Alice"}
 *   "note: remember this" → {isValid: true, speaker: "note"}
 *   "John: --I forgot" → {isValid: true, speaker: "John"}
 *   "Jenny: 2024." → {isValid: true, speaker: "Jenny"}
 *   "Q: Tell me more." → {isValid: true, speaker: "Q"}
 *   "Dr. Johnson: Good morning" → {isValid: true, speaker: "Dr. Johnson"}
 */
function isValidSpeakerPattern(text) {
  // Try bracketed pattern first: [anything] optional(:) optional(whitespace) content
  const bracketedMatch = text.match(/^\[([^\]]+)\]\s*:?\s*(.+)$/);
  
  if (bracketedMatch) {
    const potentialSpeaker = bracketedMatch[1];
    const remainingText = bracketedMatch[2];
    
    return {
      isValid: true,
      speaker: potentialSpeaker,
      remainingText: remainingText
    };
  }
  
  // Try unbracketed pattern: text followed by : and content
  // Speaker label can be 1-6 words to avoid matching things like full sentences with colons
  // This is a balance between permissiveness and avoiding false positives
  const unbracketedMatch = text.match(/^([^:\n]{1,100}?):\s*(.+)$/);
  
  if (unbracketedMatch) {
    const potentialSpeaker = unbracketedMatch[1].trim();
    const remainingText = unbracketedMatch[2];
    
    // Verify speaker label isn't too long (avoid matching long sentences)
    const wordCount = potentialSpeaker.split(/\s+/).length;
    if (wordCount <= 6 && remainingText.trim().length > 0) {
      return {
        isValid: true,
        speaker: potentialSpeaker,
        remainingText: remainingText
      };
    }
  }
  
  // No valid pattern found
  return { isValid: false, speaker: null, remainingText: text };
}

/**
 * FUNCTION: detectParagraphs
 * 
 * PURPOSE: Analyze corrected transcript text to identify paragraph boundaries and speakers
 * 
 * WHY: The corrected transcript may have multiple paragraphs and speaker changes.
 *      We need to preserve this structure in the final aligned JSON output.
 * 
 * INPUT FORMAT:
 *   Plain text with:
 *   - Paragraphs separated by one or more newlines
 *   - Optional speaker labels:
 *     * Bracketed: "[Name]: text" or "[Name] text"
 *     * Unbracketed: "Name: text" (colon required)
 *   - Names can contain periods and dashes (Dr. Johnson, Smith-Jones)
 *   - Speaker validation: text after separator must start with capital letter
 * 
 * INPUTS:
 *   - plainText: The corrected transcript as a plain text string
 * 
 * OUTPUTS:
 *   - Array of paragraph metadata objects, each containing:
 *     * paragraphIndex: Index of this paragraph (0, 1, 2, ...)
 *     * startWordIndex: Global word index where this paragraph starts
 *     * endWordIndex: Global word index where this paragraph ends
 *     * wordCount: Number of words in this paragraph
 *     * speaker: Speaker name (null if no valid speaker label)
 * 
 * EXAMPLE INPUT:
 *   "[Alice]: Hello there. How are you?\nBob: I'm doing well, thanks!"
 * 
 * EXAMPLE OUTPUT:
 *   [
 *     {
 *       paragraphIndex: 0,
 *       startWordIndex: 0,
 *       endWordIndex: 5,
 *       wordCount: 6,
 *       speaker: "Alice"
 *     },
 *     {
 *       paragraphIndex: 1,
 *       startWordIndex: 6,
 *       endWordIndex: 10,
 *       wordCount: 5,
 *       speaker: "Bob"
 *     }
 *   ]
 * 
 * PROCESS:
 *   1. Split text by one or more newlines to get paragraphs
 *   2. For each paragraph:
 *      a. Validate speaker label pattern
 *      b. Extract speaker name if valid
 *      c. Remove speaker label from paragraph text
 *      d. Count words in paragraph (excluding speaker label)
 *      e. Track cumulative word index across all paragraphs
 *   3. Return array of paragraph metadata for JSON generation
 */
function detectParagraphs(plainText) {
  // Split by one or more newlines (paragraph separator in plain text)
  const paragraphs = plainText.split(/\n+/);
  
  // Array to store metadata about each paragraph
  const paragraphMap = [];
  
  // Track the cumulative word index across all paragraphs
  let wordIndex = 0;
  
  // Process each paragraph
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const trimmedParagraph = paragraph.trim();
    
    // Skip empty paragraphs
    if (trimmedParagraph.length > 0) {
      // Check if paragraph has a valid speaker pattern
      const validation = isValidSpeakerPattern(trimmedParagraph);
      
      let speaker = null;
      let paragraphText = trimmedParagraph;
      
      if (validation.isValid) {
        speaker = validation.speaker;
        paragraphText = validation.remainingText;
      }
      
      // Split paragraph text into words (by whitespace)
      const paragraphWords = paragraphText.split(/\s+/).filter(w => w.length > 0);
      
      // Only add to map if paragraph has actual words
      if (paragraphWords.length > 0) {
        paragraphMap.push({
          paragraphIndex: paragraphIndex,
          startWordIndex: wordIndex,
          endWordIndex: wordIndex + paragraphWords.length - 1,
          wordCount: paragraphWords.length,
          speaker: speaker
        });
        
        // Move word index forward for next paragraph
        wordIndex += paragraphWords.length;
      }
    }
  });
  
  return paragraphMap;
}

/**
 * FUNCTION: alignWords
 *
 * PURPOSE: Align two sequences of words using edit distance (Levenshtein distance) algorithm
 *
 * WHY: Machine transcripts contain errors (wrong words, missing words, extra words).
 *      We need to map each word in the corrected transcript to a word in the
 *      machine transcript (or mark it as inserted/deleted) to transfer timing data.
 *
 * ALGORITHM: Dynamic Programming Edit Distance with Backtracking
 *   - Uses memory-efficient typed arrays
 *   - For very large inputs, uses chunked alignment to avoid memory issues
 *
 * INPUTS:
 *   - sourceWords: Array of words from the machine transcript (has timings)
 *   - targetWords: Array of words from the corrected transcript (needs timings)
 *
 * OUTPUTS:
 *   - Array of alignment objects, each describing the relationship between words:
 *     * {type: 'match', sourceIdx, targetIdx} - Words are the same
 *     * {type: 'substitute', sourceIdx, targetIdx} - Words are different (one replaces another)
 *     * {type: 'insert', sourceIdx: null, targetIdx} - Word added in corrected transcript
 *     * {type: 'delete', sourceIdx, targetIdx: null} - Word removed from machine transcript
 *
 * EXAMPLE:
 *   sourceWords: ["I", "think", "we", "should"]
 *   targetWords: ["I", "believe", "we", "must"]
 *
 *   Result: [
 *     {type: 'match', sourceIdx: 0, targetIdx: 0},      // "I" matches "I"
 *     {type: 'substitute', sourceIdx: 1, targetIdx: 1}, // "think" → "believe"
 *     {type: 'match', sourceIdx: 2, targetIdx: 2},      // "we" matches "we"
 *     {type: 'substitute', sourceIdx: 3, targetIdx: 3}  // "should" → "must"
 *   ]
 */
function alignWords(sourceWords, targetWords) {
  const m = sourceWords.length;
  const n = targetWords.length;

  // Memory threshold: ~40MB with Uint32Array (10M cells * 4 bytes)
  const MEMORY_THRESHOLD = 10000000;

  if (m * n <= MEMORY_THRESHOLD) {
    // Use standard DP for inputs that fit in memory
    return alignWordsStandard(sourceWords, targetWords);
  } else {
    // Use banded alignment with large bandwidth (4000)
    // This uses ~2GB memory but handles long transcripts accurately
    // Allows up to 4000 cumulative insertions/deletions before going out of sync
    return alignWordsBanded(sourceWords, targetWords, 4000);
  }
}

/**
 * Standard DP alignment with full matrix
 * Uses typed arrays for memory efficiency
 */
function alignWordsStandard(sourceWords, targetWords) {
  const m = sourceWords.length;
  const n = targetWords.length;

  // Use typed array for better memory efficiency (4 bytes vs 8+ bytes per number)
  // Flat array instead of 2D for better performance
  const dp = new Uint32Array((m + 1) * (n + 1));
  const width = n + 1;

  // Helper to access 2D position in flat array
  const idx = (i, j) => i * width + j;

  // Initialize base cases:
  // dp[i][0] = i: delete all i source words
  // dp[0][j] = j: insert all j target words
  for (let i = 0; i <= m; i++) dp[idx(i, 0)] = i;
  for (let j = 0; j <= n; j++) dp[idx(0, j)] = j;

  // Fill the DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (normalizeWord(sourceWords[i-1]) === normalizeWord(targetWords[j-1])) {
        // Words match - no cost
        dp[idx(i, j)] = dp[idx(i-1, j-1)];
      } else {
        // Choose minimum cost operation
        dp[idx(i, j)] = Math.min(
          dp[idx(i-1, j-1)] + 1,  // substitute
          dp[idx(i-1, j)] + 1,    // delete
          dp[idx(i, j-1)] + 1     // insert
        );
      }
    }
  }

  // Backtrack to find alignment
  const alignment = [];
  let i = m, j = n;

  while (i > 0 || j > 0) {
    if (i === 0) {
      alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j-1 });
      j--;
    } else if (j === 0) {
      alignment.push({ type: 'delete', sourceIdx: i-1, targetIdx: null });
      i--;
    } else {
      const current = dp[idx(i, j)];

      if (normalizeWord(sourceWords[i-1]) === normalizeWord(targetWords[j-1])) {
        alignment.push({ type: 'match', sourceIdx: i-1, targetIdx: j-1 });
        i--; j--;
      } else if (current === dp[idx(i-1, j-1)] + 1) {
        alignment.push({ type: 'substitute', sourceIdx: i-1, targetIdx: j-1 });
        i--; j--;
      } else if (current === dp[idx(i-1, j)] + 1) {
        alignment.push({ type: 'delete', sourceIdx: i-1, targetIdx: null });
        i--;
      } else {
        alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j-1 });
        j--;
      }
    }
  }

  alignment.reverse();
  return alignment;
}

/**
 * Banded alignment for very large inputs
 * Uses typed arrays for memory efficiency - critical for large transcripts
 *
 * Memory: O(m * bandwidth) with ~5 bytes per cell (vs ~50+ bytes with Maps)
 * Time: O(m * bandwidth)
 */
function alignWordsBanded(sourceWords, targetWords, bandwidth) {
  const m = sourceWords.length;
  const n = targetWords.length;

  // Handle edge cases
  if (m === 0) {
    return targetWords.map((_, j) => ({ type: 'insert', sourceIdx: null, targetIdx: j }));
  }
  if (n === 0) {
    return sourceWords.map((_, i) => ({ type: 'delete', sourceIdx: i, targetIdx: null }));
  }

  // Adjust bandwidth - must cover length difference
  const lengthDiff = Math.abs(m - n);
  const effectiveBandwidth = Math.max(bandwidth, lengthDiff + 50);

  // Band width is 2*bandwidth+1 (cells on each side of diagonal, plus diagonal)
  const bandWidth = 2 * effectiveBandwidth + 1;

  const INF = 0xFFFFFFFF; // Max uint32

  // Backtrack codes: 0=none, 1=match, 2=substitute, 3=delete, 4=insert
  const NONE = 0, MATCH = 1, SUB = 2, DEL = 3, INS = 4;

  // Typed arrays: costs (4 bytes each) + backtrack (1 byte each) = 5 bytes/cell
  // For 50k words with bandwidth 2000: 50k * 4001 * 5 = ~1GB
  const totalCells = (m + 1) * bandWidth;
  const costs = new Uint32Array(totalCells);
  const backs = new Uint8Array(totalCells);

  // Fill with INF initially
  costs.fill(INF);

  // Helper: get diagonal center for row i
  const getDiag = (i) => Math.round(i * n / m);

  // Helper: convert (i, j) to array index, returns -1 if outside band
  const getIdx = (i, j) => {
    const diag = getDiag(i);
    const offset = j - diag + effectiveBandwidth; // offset within band
    if (offset < 0 || offset >= bandWidth) return -1;
    return i * bandWidth + offset;
  };

  // Helper: get cost at (i, j), returns INF if outside band
  const getCost = (i, j) => {
    if (i < 0 || j < 0 || j > n) return INF;
    const idx = getIdx(i, j);
    if (idx < 0) return INF;
    return costs[idx];
  };

  // Initialize row 0: cost to insert j words
  for (let j = 0; j <= n; j++) {
    const idx = getIdx(0, j);
    if (idx >= 0) {
      costs[idx] = j;
      backs[idx] = j > 0 ? INS : NONE;
    }
  }

  // Fill DP table row by row
  for (let i = 1; i <= m; i++) {
    const diag = getDiag(i);
    const minJ = Math.max(0, diag - effectiveBandwidth);
    const maxJ = Math.min(n, diag + effectiveBandwidth);

    for (let j = minJ; j <= maxJ; j++) {
      const idx = getIdx(i, j);
      if (idx < 0) continue;

      if (j === 0) {
        // Base case: delete i source words
        costs[idx] = i;
        backs[idx] = DEL;
      } else {
        const isMatch = normalizeWord(sourceWords[i-1]) === normalizeWord(targetWords[j-1]);

        const diagCost = getCost(i-1, j-1);
        const matchSubCost = diagCost + (isMatch ? 0 : 1);
        const delCost = getCost(i-1, j) + 1;
        const insCost = getCost(i, j-1) + 1;

        let minCost = matchSubCost;
        let back = isMatch ? MATCH : SUB;

        if (delCost < minCost) {
          minCost = delCost;
          back = DEL;
        }
        if (insCost < minCost) {
          minCost = insCost;
          back = INS;
        }

        costs[idx] = minCost;
        backs[idx] = back;
      }
    }
  }

  // Backtrack to find alignment
  const alignment = [];
  let i = m, j = n;

  // Check if end point is reachable
  const endIdx = getIdx(m, n);
  if (endIdx < 0 || costs[endIdx] === INF) {
    console.warn('Banded alignment: end point outside band, using greedy fallback');
    return alignWordsGreedy(sourceWords, targetWords);
  }

  while (i > 0 || j > 0) {
    if (i === 0) {
      alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j-1 });
      j--;
    } else if (j === 0) {
      alignment.push({ type: 'delete', sourceIdx: i-1, targetIdx: null });
      i--;
    } else {
      const idx = getIdx(i, j);
      const back = backs[idx];

      switch (back) {
        case MATCH:
          alignment.push({ type: 'match', sourceIdx: i-1, targetIdx: j-1 });
          i--; j--;
          break;
        case SUB:
          alignment.push({ type: 'substitute', sourceIdx: i-1, targetIdx: j-1 });
          i--; j--;
          break;
        case DEL:
          alignment.push({ type: 'delete', sourceIdx: i-1, targetIdx: null });
          i--;
          break;
        case INS:
          alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j-1 });
          j--;
          break;
        default:
          console.warn('Banded alignment: unexpected backtrack value');
          i--; j--;
      }
    }
  }

  alignment.reverse();
  return alignment;
}

/**
 * Greedy alignment as fallback when banded alignment can't reach the endpoint
 * Uses lookahead to find matches within a window
 */
function alignWordsGreedy(sourceWords, targetWords) {
  console.warn('Using greedy fallback alignment');

  const alignment = [];
  const m = sourceWords.length;
  const n = targetWords.length;
  const LOOKAHEAD = 50; // Look ahead this many words for matches

  let i = 0, j = 0;
  while (i < m && j < n) {
    if (normalizeWord(sourceWords[i]) === normalizeWord(targetWords[j])) {
      alignment.push({ type: 'match', sourceIdx: i, targetIdx: j });
      i++; j++;
    } else {
      // Look ahead in target for a match with current source word
      let foundInTarget = -1;
      for (let k = j + 1; k < Math.min(j + LOOKAHEAD, n); k++) {
        if (normalizeWord(sourceWords[i]) === normalizeWord(targetWords[k])) {
          foundInTarget = k;
          break;
        }
      }

      // Look ahead in source for a match with current target word
      let foundInSource = -1;
      for (let k = i + 1; k < Math.min(i + LOOKAHEAD, m); k++) {
        if (normalizeWord(sourceWords[k]) === normalizeWord(targetWords[j])) {
          foundInSource = k;
          break;
        }
      }

      if (foundInTarget >= 0 && (foundInSource < 0 || foundInTarget - j <= foundInSource - i)) {
        // Insert target words until we reach the match
        while (j < foundInTarget) {
          alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j });
          j++;
        }
      } else if (foundInSource >= 0) {
        // Delete source words until we reach the match
        while (i < foundInSource) {
          alignment.push({ type: 'delete', sourceIdx: i, targetIdx: null });
          i++;
        }
      } else {
        // No match found in lookahead, substitute
        alignment.push({ type: 'substitute', sourceIdx: i, targetIdx: j });
        i++; j++;
      }
    }
  }

  // Handle remaining words
  while (i < m) {
    alignment.push({ type: 'delete', sourceIdx: i, targetIdx: null });
    i++;
  }
  while (j < n) {
    alignment.push({ type: 'insert', sourceIdx: null, targetIdx: j });
    j++;
  }

  return alignment;
}

/**
 * FUNCTION: generateAlignedJSON
 * 
 * PURPOSE: Generate JSON output with aligned timings and paragraph structure
 * 
 * WHY: This is the final step that combines:
 *      1. Corrected transcript words (from human editor)
 *      2. Timing data (from machine transcript)
 *      3. Paragraph structure and speakers (from corrected transcript)
 *      to produce a perfectly timed, correctly worded, well-structured JSON transcript
 * 
 * INPUTS:
 *   - alignment: Array of alignment objects from alignWords() function
 *   - sourceWords: Words from machine transcript (have timings)
 *   - targetWords: Words from corrected transcript (need timings)
 *   - timings: Timing data from machine transcript (in seconds)
 *   - plainText: Corrected transcript as plain text (for paragraph structure)
 * 
 * OUTPUTS:
 *   - JSON object with structure:
 *     {
 *       words: [{start, end, text}, ...],
 *       paragraphs: [{speaker, start, end}, ...]
 *     }
 * 
 * PROCESS:
 *   PHASE 1: Build output array with words and timings
 *     - For each aligned word:
 *       * If MATCH or SUBSTITUTE: Use timing from source word
 *       * If INSERT: Interpolate timing (use next/previous timing)
 *       * If DELETE: Skip (word doesn't appear in output)
 *   
 *   PHASE 2: Detect paragraph structure from plain text
 *   
 *   PHASE 3: Generate JSON with proper paragraph structure
 */
function generateAlignedJSON(alignment, sourceWords, targetWords, timings, plainText) {
  // ===== PHASE 1: BUILD OUTPUT ARRAY WITH WORDS AND TIMINGS =====
  
  // Array to store final words with their timing information
  // Each element: {word, start, end, targetIdx}
  const outputWords = [];
  
  // Track the most recent timing for interpolation purposes
  let lastTiming = null;
  
  // Process each alignment operation to build the output
  alignment.forEach((align, idx) => {
    
    // CASE 1: MATCH or SUBSTITUTE
    // The target word corresponds to a source word, so we can use its timing directly
    if (align.type === 'match' || align.type === 'substitute') {
      const timing = timings[align.sourceIdx];
      outputWords.push({
        word: targetWords[align.targetIdx],   // Use corrected word text
        start: timing.start,                  // Use machine timing (seconds)
        end: timing.end,                      // Use machine timing (seconds)
        targetIdx: align.targetIdx            // Track position in target array
      });
      lastTiming = timing;  // Remember this for interpolating inserted words
    } 
    
    // CASE 2: INSERT
    // This word was added in the corrected transcript, so it has no direct timing.
    // We need to estimate/interpolate the timing from nearby words.
    else if (align.type === 'insert') {
      // Look ahead in the alignment to find the next word with timing
      let nextTiming = null;
      for (let i = idx + 1; i < alignment.length; i++) {
        if (alignment[i].type === 'match' || alignment[i].type === 'substitute') {
          nextTiming = timings[alignment[i].sourceIdx];
          break;  // Found it, stop searching
        }
      }
      
      // Use the next timing if found, otherwise fall back to the last timing
      // This means inserted words will "borrow" timing from adjacent words
      const timing = nextTiming || lastTiming;
      
      if (timing) {
        outputWords.push({
          word: targetWords[align.targetIdx],
          start: timing.start,    // Borrow start time from nearby word
          end: timing.end,        // Borrow end time from nearby word
          targetIdx: align.targetIdx
        });
      } else {
        // FALLBACK: If no timing available at all (rare edge case)
        // Use dummy timing values so the output is still valid
        outputWords.push({
          word: targetWords[align.targetIdx],
          start: 0,     // Start at beginning
          end: 0.1,     // 100ms duration
          targetIdx: align.targetIdx
        });
      }
    }
    
    // CASE 3: DELETE
    // Word existed in machine transcript but not in corrected transcript
    // We simply skip it - it won't appear in the output at all
    // (No code needed here, just explanation)
  });
  
  // ===== PHASE 2: DETECT PARAGRAPH STRUCTURE =====
  // Analyze the plain text to find paragraph boundaries and speaker labels
  const paragraphMap = detectParagraphs(plainText);
  
  // ===== PHASE 2.5: FIX OVERLAPPING TIMESTAMPS =====
  // When multiple inserted words borrow the same timestamp, distribute the time among them
  for (let i = 0; i < outputWords.length; i++) {
    const currentWord = outputWords[i];
    
    // Find all consecutive words with the same timestamp
    const sameTimingGroup = [currentWord];
    let j = i + 1;
    
    while (j < outputWords.length && 
           outputWords[j].start === currentWord.start && 
           outputWords[j].end === currentWord.end) {
      sameTimingGroup.push(outputWords[j]);
      j++;
    }
    
    // If we have multiple words with the same timing, redistribute
    if (sameTimingGroup.length > 1) {
      const groupStart = currentWord.start;
      const groupEnd = currentWord.end;
      const totalDuration = groupEnd - groupStart;
      const wordDuration = totalDuration / sameTimingGroup.length;
      
      // Redistribute timing across the group
      sameTimingGroup.forEach((word, index) => {
        word.start = groupStart + (wordDuration * index);
        word.end = groupStart + (wordDuration * (index + 1));
      });
      
      // Skip the words we just processed
      i = j - 1;
    }
  }
  
  // ===== PHASE 3: BUILD JSON OUTPUT =====
  
  // Convert words to JSON format
  const jsonWords = outputWords.map((item, index) => ({
    start: item.start,       // Already in seconds
    end: item.end,           // Already in seconds
    text: item.word
  }));
  
  // Build paragraphs array
  const jsonParagraphs = [];
  
  if (paragraphMap.length > 0) {
    // MULTI-PARAGRAPH CASE: Create paragraph objects based on detected structure
    paragraphMap.forEach(paragraph => {
      // Find words in this paragraph
      const paragraphWords = outputWords.filter(item =>
        item.targetIdx >= paragraph.startWordIndex &&
        item.targetIdx <= paragraph.endWordIndex
      );
      
      if (paragraphWords.length > 0) {
        // Get start time from first word, end time from last word
        const firstWord = paragraphWords[0];
        const lastWord = paragraphWords[paragraphWords.length - 1];
        
        const paragraphObj = {
          start: firstWord.start,  // In seconds
          end: lastWord.end        // In seconds
        };
        
        // Add speaker if present (without brackets or punctuation)
        if (paragraph.speaker) {
          paragraphObj.speaker = paragraph.speaker;
        }
        
        jsonParagraphs.push(paragraphObj);
      }
    });
  } else {
    // SINGLE PARAGRAPH FALLBACK: No paragraph breaks detected
    if (outputWords.length > 0) {
      const firstWord = outputWords[0];
      const lastWord = outputWords[outputWords.length - 1];
      
      jsonParagraphs.push({
        start: firstWord.start,
        end: lastWord.end
      });
    }
  }
  
  // Create transcript field - all words as one string without speaker names
  // Convert double quotes to single quotes for better compatibility
  const transcript = jsonWords.map(word => word.text).join(' ').replace(/"/g, "'");
  
  return {
    words: jsonWords,
    paragraphs: jsonParagraphs,
    transcript: transcript
  };
}

/**
 * ============================================================================
 * MAIN API FUNCTION
 * ============================================================================
 */

/**
 * FUNCTION: alignTranscripts
 * 
 * PURPOSE: Main entry point for transcript alignment using JSON format
 * 
 * WHY: Provides a simple, high-level API for aligning transcripts.
 *      This is the main function users will call.
 * 
 * INPUTS:
 *   - machineTranscript: JSON object from machine transcript (has timings)
 *     Format: {words: [{start, end, text}, ...], paragraphs: [...]}
 *   - correctedText: Plain text of corrected transcript
 *     Format: "[Speaker]: text\nSpeaker: more text"
 * 
 * OUTPUTS:
 *   - JSON object with corrected words and aligned timings
 *     Format: {words: [{start, end, text}, ...], paragraphs: [...]}
 * 
 * EXAMPLE USAGE:
 *   const machineJSON = {
 *     words: [{start: 4.76, end: 5.28, text: "Testing"}, ...],
 *     paragraphs: [{speaker: "Alice", start: 4.76, end: 10.0}]
 *   };
 *   const correctedText = "[Alice]: Testing the production version...";
 *   const alignedJSON = alignTranscripts(machineJSON, correctedText);
 * 
 * ALGORITHM STEPS:
 *   1. Preprocess corrected text to handle escaped newlines
 *   2. Extract words and timings from machine JSON
 *   3. Extract words from corrected plain text
 *   4. Align the two word sequences using edit distance
 *   5. Generate aligned JSON output with timing and structure
 */
function alignTranscripts(machineTranscript, correctedText) {
  // Step 1: Extract words and timings from machine JSON
  const { words: sourceWords, timings } = extractWordsFromJSON(machineTranscript);
  
  // Step 2: Extract words from corrected text (without speaker labels)
  const targetWords = extractWordsFromPlainText(correctedText);
  
  // Step 3: Align the two word sequences
  const alignment = alignWords(sourceWords, targetWords);
  
  // Step 4: Generate aligned JSON output
  const alignedJSON = generateAlignedJSON(
    alignment,
    sourceWords,
    targetWords,
    timings,
    correctedText
  );
  
  return alignedJSON;
}

/**
 * ============================================================================
 * EXPORTS (for module usage)
 * ============================================================================
 */

// Export main API function
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    alignTranscripts,
    // Export internal functions for advanced usage
    extractWordsFromJSON,
    extractWordsFromPlainText,
    detectParagraphs,
    alignWords,
    generateAlignedJSON,
    // Export helpers
    stripPunctuation,
    normalizeWord,
    isValidSpeakerPattern
  };
}