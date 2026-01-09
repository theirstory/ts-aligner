# Transcript Alignment Algorithm

**Version:** 0.2.0  

A JavaScript library for aligning machine-generated transcripts (with timing data) with human-corrected transcripts (without timing data). This algorithm intelligently transfers word-level timing information from raw ASR output to corrected text while preserving paragraph structure and speaker labels.

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [API Reference](#api-reference)
- [Input Formats](#input-formats)
- [Testing](#testing)
- [Examples](#examples)
- [Algorithm Details](#algorithm-details)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [Changelog](#changelog)

## Overview

When you transcribe audio or video with automatic speech recognition (ASR), you get word-level timestamps but often with transcription errors. Human editors can correct the text, but this process loses the timing data. This library solves that problem by:

1. Taking the **machine transcript** (has timing, has errors)
2. Taking the **corrected transcript** (no timing, no errors)
3. Using **edit distance alignment** to map words between them
4. Producing a **corrected transcript with accurate timing**
```
Machine Transcript          Corrected Transcript              Aligned Output
------------------          --------------------              --------------
[0.0-0.5] "I"          +    "I believe we should go"     →   [0.0-0.5] "I"
[0.5-1.0] "think"                                             [0.5-1.0] "believe"
[1.0-1.5] "we"                                                [1.0-1.5] "we"
[1.5-2.0] "should"                                            [1.5-2.0] "should"
                                                              [1.5-2.0] "go" (borrowed)
```

## Features

✅ **Intelligent Word Alignment** - Uses Levenshtein distance algorithm for optimal matching  
✅ **Punctuation-Aware** - Correctly matches "hello" with "hello," or "recording." with "recording"  
✅ **Case-Insensitive** - "Hello" and "hello" are treated as the same word  
✅ **Speaker Preservation** - Maintains speaker labels in multiple formats  
✅ **Paragraph Structure** - Preserves paragraph breaks and formatting  
✅ **Timing Transfer** - Borrowed timing for inserted words  
✅ **Overlap Prevention** - Distributes timing among consecutive inserted words  
✅ **JSON-Based** - Works with standard JSON format (use `conversion.js` for HTML)  
✅ **Language Agnostic** - No language-specific assumptions  
✅ **No Build Required** - Plain JavaScript, works in Node.js and browsers  
✅ **Well Tested** - Includes comprehensive test suite

## Installation

### Direct Download

Download `alignment.js` from the repository and include it in your project. No build step required!

### Node.js
```javascript
const { alignTranscripts } = require('./alignment.js');
```

### Browser
```html
<script src="alignment.js"></script>
<script>
  // Functions are available globally
  const result = alignTranscripts(machineJSON, correctedText);
</script>
```

### ES Modules
```javascript
import { alignTranscripts } from './alignment.js';
```

## Quick Start
```javascript
const { alignTranscripts } = require('./alignment.js');

// Machine transcript from ASR (has timing, has errors)
const machineTranscript = {
  "words": [
    {"start": 1.0, "end": 1.5, "text": "Hello"},
    {"start": 1.5, "end": 2.0, "text": "word"}  // incorrect
  ],
  "paragraphs": [
    {"start": 1.0, "end": 2.0}
  ]
};

// Human-corrected transcript (no timing, no errors)
const correctedText = "Hello world";

// Align them
const aligned = alignTranscripts(machineTranscript, correctedText);

>> console.log(aligned);
>> {
>>   "words": [
>>     {"start": 1.0, "end": 1.5, "text": "Hello"},
>>     {"start": 1.5, "end": 2.0, "text": "world"}  
>>   ],
>>   "paragraphs": [
>>     {"start": 1.0, "end": 2.0}
>>   ],
>>   "transcript": "Hello world"
>> }
```

## How It Works

### The Problem
```
Machine Transcript (from ASR):
  ✓ Has accurate word-level timestamps
  ✗ Contains transcription errors

Human-Corrected Transcript:
  ✓ Has accurate text
  ✗ Has no timing information

Goal: Combine them → Accurate text + Accurate timing
```

### The Solution

The algorithm uses **edit distance** (Levenshtein algorithm) to find the optimal alignment between the two transcripts:

1. **Extract** words from both transcripts
2. **Align** using dynamic programming to find matches, substitutions, insertions, and deletions
3. **Transfer** timing from machine words to corrected words
4. **Reconstruct** output with proper structure

### Example Alignment
```
Machine:   ["I", "think", "we", "should"]
Corrected: ["I", "believe", "we", "must", "go"]

Alignment:
  I      → I       (match - keep timing [0.0-0.5])
  think  → believe (substitute - keep timing [0.5-1.0])
  we     → we      (match - keep timing [1.0-1.5])
  should → must    (substitute - keep timing [1.5-2.0])
         → go      (insert - borrows timing from previous word "must" [1.5-2.0])
```

## API Reference

### Main Function

#### `alignTranscripts(machineTranscript, correctedText)`

Aligns a machine transcript with a corrected transcript.

**Parameters:**
- `machineTranscript` (Object): Machine transcript in JSON format
```javascript
  {
    words: [{start: number, end: number, text: string}, ...],
    paragraphs: [{speaker?: string, start: number, end: number}, ...]
  }
```
- `correctedText` (String): Human-corrected plain text
```
  Speaker: First paragraph text.
  Another Speaker: Second paragraph.
```

**Returns:** (Object) Aligned transcript
```javascript
{
  words: [{start, end, text}, ...],
  paragraphs: [{speaker?, start, end}, ...],
  transcript: string  // All words joined as single string
}
```

**Example:**
```javascript
const aligned = alignTranscripts(machineJSON, correctedText);
```

### Helper Functions

#### `extractWordsFromJSON(jsonData)`
Extracts words and timings from JSON transcript.

**Returns:** `{words: string[], timings: {start, end}[]}`

#### `extractWordsFromPlainText(plainText)`
Extracts words from plain text, excluding speaker labels.

**Returns:** `string[]` (array of words)

#### `detectParagraphs(plainText)`
Detects paragraph boundaries and speaker labels.

**Returns:** Array of paragraph metadata objects

#### `alignWords(sourceWords, targetWords)`
Performs edit distance alignment between word arrays.

**Returns:** Array of alignment operations

#### `generateAlignedJSON(alignment, sourceWords, targetWords, timings, plainText)`
Generates final aligned JSON output.

**Returns:** Aligned transcript object

#### `normalizeWord(word)`
Normalizes a word for comparison (lowercase, no punctuation).

**Returns:** `string`

#### `stripPunctuation(word)`
Removes trailing punctuation from a word.

**Returns:** `string`

#### `isValidSpeakerPattern(text)`
Validates and extracts speaker labels from text.

**Returns:** `{isValid: boolean, speaker: string|null, remainingText: string}`

## Input Formats

### Machine Transcript (JSON)
```javascript
{
  "words": [
    {
      "start": 4.76,      // Start time in seconds
      "end": 5.28,        // End time in seconds
      "text": "word"      // Word text
    }
  ],
  "paragraphs": [
    {
      "speaker": "Alice", // Optional speaker name
      "start": 4.76,      // Paragraph start time
      "end": 10.0         // Paragraph end time
    }
  ]
}
```

**Notes:**
- Times must be in **seconds** (floating point)
- `paragraphs` array is optional
- `speaker` field is optional

### Corrected Transcript (Plain Text)

The algorithm supports multiple speaker formats:

#### Bracketed Format
```
[Alice]: Hello there. How are you?
[Bob]: I'm doing well, thanks!
```

#### Unbracketed Format
```
Alice: Hello there. How are you?
Bob: I'm doing well, thanks!
```

#### Mixed Format
```
[Alice]: Hello there.
Bob: Hi Alice!
Dr. Johnson: Good morning everyone.
```

#### No Speakers
```
This is a transcript without any speaker labels.
It can span multiple paragraphs.
```

**Rules:**
- Paragraphs separated by **one or more newlines** (`\n`)
- Speaker labels are **optional**
- Bracketed speakers: `[Name]` or `[Name]:`
- Unbracketed speakers: `Name:` (colon required)
- Speaker names can contain periods, dashes, spaces (Dr. Smith-Jones)
- Speaker labels up to 6 words (prevents false positives)
- Language agnostic (no case requirements)

## Testing

### Run Tests
```bash
# Run test suite
node test.js
```

No build step or npm install required!

### Test Coverage

The test suite includes:

1. **Basic Alignment** - Simple word substitutions
2. **Insertions** - Words added in corrected transcript
3. **Deletions** - Words removed from machine transcript
4. **Punctuation Handling** - "recording." matches "recording"
5. **Case Insensitivity** - "Hello" matches "hello"
6. **Speaker Detection** - Various speaker formats
7. **Paragraph Structure** - Multiple paragraphs
8. **Timing Transfer** - Inserted words get borrowed timing
9. **Overlap Prevention** - Multiple inserts don't overlap
10. **Edge Cases** - Empty input, no speakers, etc.

### Create Your Own Tests
```javascript
const { alignTranscripts } = require('./alignment.js');

// Your test data
const machine = { /* ... */ };
const corrected = "...";

// Run alignment
const result = alignTranscripts(machine, corrected);

// Verify results
console.assert(result.words.length === expectedLength);
console.assert(result.words[0].text === "expected");
```

## Examples

### Example 1: Basic Correction
```javascript
const machine = {
  words: [
    {start: 0, end: 0.5, text: "I"},
    {start: 0.5, end: 1.0, text: "think"}
  ],
  paragraphs: [{start: 0, end: 1.0}]
};

const corrected = "I believe";

const result = alignTranscripts(machine, corrected);
// Result: "believe" gets timing from "think" (substitute)
```

### Example 2: Multiple Speakers
```javascript
const machine = {
  words: [
    {start: 0, end: 1, text: "Hello"},
    {start: 1, end: 2, text: "Hi"}
  ],
  paragraphs: [{start: 0, end: 2}]
};

const corrected = `Alice: Hello there
Bob: Hi Alice`;

const result = alignTranscripts(machine, corrected);
// Result: 2 paragraphs with speakers preserved
```

### Example 3: Punctuation Differences
```javascript
const machine = {
  words: [
    {start: 0, end: 1, text: "recording."}  // Note the period
  ],
  paragraphs: [{start: 0, end: 1}]
};

const corrected = "recording";  // No period

const result = alignTranscripts(machine, corrected);
// Result: Correctly matches despite punctuation difference
// {start: 0, end: 1, text: "recording"}
```

### Example 4: Insertions and Deletions
```javascript
const machine = {
  words: [
    {start: 0, end: 1, text: "I"},
    {start: 1, end: 2, text: "think"},
    {start: 2, end: 3, text: "maybe"},
    {start: 3, end: 4, text: "we"}
  ],
  paragraphs: [{start: 0, end: 4}]
};

const corrected = "I definitely believe we";

const result = alignTranscripts(machine, corrected);
// Result:
// - "I" → matched (keep timing 0-1)
// - "definitely" → inserted (borrows timing from next matched word "we")
// - "think" → deleted (removed)
// - "believe" → inserted (borrows timing from next matched word "we")
// - "maybe" → deleted (removed)
// - "we" → matched (keep timing 3-4)
```

### Example 5: Real-World Scenario
```javascript
const machine = {
  words: [
    {start: 33.36, end: 33.6, text: "Age."},
    {start: 34.4, end: 34.9, text: "I"},
    {start: 35.44, end: 35.94, text: "have"},
    {start: 36.71, end: 37.19, text: "my"},
    {start: 37.19, end: 37.35, text: "ideas"},
    {start: 37.35, end: 37.83, text: "are"},
    {start: 37.83, end: 37.99, text: "kind"},
    {start: 37.99, end: 38.49, text: "of"},
    {start: 38.95, end: 39.19, text: "way"},
    {start: 39.18, end: 39.34, text: "back,"}
  ],
  paragraphs: [{start: 33.36, end: 39.34}]
};

const corrected = "BAER: My ideas came way back, you know.";

const result = alignTranscripts(machine, corrected);
// Result: Properly aligned with speaker label
```

## Algorithm Details

### Edit Distance (Levenshtein Algorithm)

The core of the algorithm is the **Levenshtein distance** calculation using dynamic programming:

1. **Build DP Table**: Create a 2D table where `dp[i][j]` represents the minimum number of operations to align the first `i` source words with the first `j` target words.

2. **Operations**:
   - **Match**: Words are identical (cost: 0)
   - **Substitute**: Replace one word with another (cost: 1)
   - **Insert**: Add a new word (cost: 1)
   - **Delete**: Remove a word (cost: 1)

3. **Backtrack**: Trace back through the table to find which operations were used.

**Time Complexity:** O(m × n) where m, n are word counts  
**Space Complexity:** O(m × n) for DP table

### Word Matching

Words are considered matching if they're identical after normalization:
```javascript
normalizeWord("Hello,") === normalizeWord("hello")  // true
normalizeWord("world!") === normalizeWord("World")  // true
normalizeWord("recording.") === normalizeWord("recording")  // true
```

**Normalization:**
1. Convert to lowercase
2. Strip trailing punctuation (`.`, `,`, `!`, `?`, `;`, `:`, `'`, `"`)

### Timing Transfer for Inserted Words

When a word is **inserted** (exists in corrected but not in machine transcript):

1. **Look ahead**: Find the next matched/substituted word in the alignment
2. **Use next timing**: If found, borrow that exact timing
3. **Look back**: If no next word, use the previous matched/substituted word's timing
4. **Fallback**: If neither exists, use dummy timing (0.0-0.1s)

**Important:** The algorithm prioritizes looking ahead first, then falls back to the previous word.

**Example with look-ahead:**
```
Machine:   ["Hello", "world"]
Corrected: ["Hello", "beautiful", "world"]

Result:
  "Hello"     → [0.0-1.0] (matched)
  "beautiful" → [1.0-2.0] (inserted - borrows from next word "world")
  "world"     → [1.0-2.0] (matched)
```

**Example with look-back:**
```
Machine:   ["Hello", "world"]
Corrected: ["Hello", "world", "today"]

Result:
  "Hello" → [0.0-1.0] (matched)
  "world" → [1.0-2.0] (matched)
  "today" → [1.0-2.0] (inserted - borrows from previous word "world")
```

**Overlap Prevention**: If multiple consecutive words borrow the same timing, the algorithm evenly distributes that time window among them.

Example:
```
Original timing: [5.0, 6.0]
3 consecutive inserted words all borrow this timing

After distribution:
→ Word 1: [5.0, 5.33]
→ Word 2: [5.33, 5.67]
→ Word 3: [5.67, 6.0]
```

### Speaker Detection

The algorithm uses a permissive, language-agnostic approach:

**Valid patterns:**
- `[Name]: text` (bracketed with colon)
- `[Name] text` (bracketed without colon)
- `Name: text` (unbracketed with colon)

**Validation:**
- Speaker label can be 1-6 words
- Must be followed by content
- No language-specific requirements

**Not valid:**
- `This is a sentence: with a colon` (too many words before colon)
- `:text` (empty speaker)
- `Name` (no content after)

## Limitations

### Known Limitations

1. **Inserted Word Timing**: Inserted words borrow timing from adjacent words, which may not reflect the actual spoken timing. The timing is an approximation.

2. **Large Restructuring**: The algorithm assumes words are mostly in the same order. Heavily restructured text may not align well.

3. **No Audio Analysis**: Timing is transferred, not calculated from audio. The algorithm doesn't listen to the audio file.

4. **Case Preservation**: Output uses the case from the corrected transcript, not the original.

5. **Punctuation Placement**: Output uses punctuation from the corrected transcript.

### Performance Considerations

- **Time Complexity**: O(m × n) where m, n are word counts
- **Typical Performance**: <100ms for transcripts up to 1000 words
- **Memory Usage**: O(m × n) for DP table
- **Recommended Limit**: 5000 words per transcript

### When NOT to Use

❌ **Real-time streaming** (algorithm requires complete transcripts)  
❌ **Video editing** (doesn't adjust timing for cuts/edits)  
❌ **Translation** (assumes same language and word order)  
❌ **Heavy restructuring** (reordering many sentences)  

### Workarounds

**For long transcripts**: Split into smaller chunks and align separately.

**For real-time**: Use a sliding window approach with the last N words.

**For restructured text**: Manually segment into sections before aligning.

## Contributing

We welcome contributions! Here's how to help:

### Reporting Issues

1. Check existing issues first
2. Provide a minimal reproducible example
3. Include:
   - Input data (machine transcript + corrected text)
   - Expected output
   - Actual output
   - Version number

### Submitting Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Run the test suite (`node test.js`)
6. Update documentation
7. Commit with clear messages
8. Push to your fork
9. Open a Pull Request

### Development Setup
```bash
# Clone the repo
git clone https://github.com/yourusername/transcript-alignment.git
cd transcript-alignment

# No build step needed! Just run tests:
node test.js
```

### Code Style

- Use clear, descriptive variable names
- Add comments for complex logic
- Follow existing code formatting
- Write tests for new features
- Update documentation

### Testing Guidelines

- Add test cases for bug fixes
- Test edge cases
- Verify no regressions
- Include real-world examples

## Changelog

### v0.2.0 (Current)

**Fixed:**
- Word matching now uses `normalizeWord()` instead of `toLowerCase()`
- Punctuation differences no longer cause misalignment
- "recording." now correctly matches "recording"

**Technical:**
- Updated `alignWords()` function to use normalized comparison
- Maintains backward compatibility

### v0.1.0

**Initial Release:**
- Core alignment algorithm using Levenshtein distance
- JSON-based API
- Speaker label detection
- Paragraph structure preservation
- Timing transfer for inserted words
- Overlap prevention for consecutive insertions

## Acknowledgments

- Algorithm based on **Levenshtein Distance** (edit distance)
- Inspired by subtitle alignment tools and forced alignment systems
- Built for practical transcript correction workflows

## Support

- **Documentation**: [Full API Docs](#api-reference)
- **Examples**: [See Examples](#examples)
- **Issues**: [GitHub Issues](https://github.com/yourusername/transcript-alignment/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/transcript-alignment/discussions)

## Related Projects

- `conversion.js` - HTML/JSON format conversion utilities (companion library)
- `hyperaudio` - Interactive transcript player
- `gentle` - Forced alignment using audio analysis

---

**Made with ❤️ for better transcripts**
