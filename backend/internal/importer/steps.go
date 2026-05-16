package importer

import (
	"regexp"
	"strings"
)

// ParsedStep is one (action, expected) pair as our store wants them.
type ParsedStep struct {
	Action   string
	Expected string
}

// blockHeader matches Testiny's `[N]` or `[N] ` line markers that prefix
// each scenario block in the Steps and Expected result columns.  Examples:
//
//	"[1] 1. Navigate to Settings"
//	"[1]"
//	"[12] foo"
var blockHeader = regexp.MustCompile(`^\[(\d+)\]\s*(.*)$`)

// ParseSteps returns one ParsedStep per `[N]` block in the Steps cell.
// Each step's Action is the block content (everything until the next
// `[N+1]` marker), and its Expected is the matching `[N]` block from the
// expected cell.  Empty leading/trailing lines are trimmed; markdown is
// preserved.
//
// If neither cell uses `[N]` markers, the entire content becomes a single
// step.  If only one of them uses markers, the unmarked one is treated as
// the Expected result of every step.  These fallbacks make the importer
// robust to old Testiny exports that didn't always emit markers.
//
// Always returns at least one step — ensuring an imported case is
// renderable in the UI even when both cells are blank.
func ParseSteps(stepsCell, expectedCell string) []ParsedStep {
	stepBlocks := splitBlocks(stepsCell)
	expBlocks := splitBlocks(expectedCell)

	switch {
	case len(stepBlocks) == 0 && len(expBlocks) == 0:
		return []ParsedStep{{Action: "", Expected: ""}}

	case len(stepBlocks) == 0:
		// no markers in steps; collapse expected into one step's expected
		return []ParsedStep{{
			Action:   strings.TrimSpace(stepsCell),
			Expected: strings.TrimSpace(expectedCell),
		}}

	case len(expBlocks) == 0:
		// markers in steps, none in expected; reuse the whole expected for each
		shared := strings.TrimSpace(expectedCell)
		out := make([]ParsedStep, 0, len(stepBlocks))
		for _, b := range stepBlocks {
			out = append(out, ParsedStep{Action: b.body, Expected: shared})
		}
		return out
	}

	expByID := map[int]string{}
	for _, b := range expBlocks {
		expByID[b.id] = b.body
	}
	out := make([]ParsedStep, 0, len(stepBlocks))
	for _, b := range stepBlocks {
		out = append(out, ParsedStep{
			Action:   b.body,
			Expected: expByID[b.id],
		})
	}
	return out
}

type block struct {
	id   int
	body string
}

// splitBlocks reads `[N]` markers and yields ordered blocks.  Lines that
// precede the first marker are silently dropped (Testiny never emits them
// in practice).
func splitBlocks(raw string) []block {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var blocks []block
	var cur *block
	for _, line := range strings.Split(raw, "\n") {
		line = strings.TrimRight(line, "\r")
		if m := blockHeader.FindStringSubmatch(line); m != nil {
			if cur != nil {
				cur.body = strings.TrimSpace(cur.body)
				blocks = append(blocks, *cur)
			}
			id := atoi(m[1])
			cur = &block{id: id, body: m[2]}
			continue
		}
		if cur == nil {
			continue
		}
		if cur.body == "" {
			cur.body = line
		} else {
			cur.body += "\n" + line
		}
	}
	if cur != nil {
		cur.body = strings.TrimSpace(cur.body)
		blocks = append(blocks, *cur)
	}
	return blocks
}

func atoi(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
	}
	return n
}
