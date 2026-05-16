package importer

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"
)

// Row is the canonical shape of one Testiny test case after the xlsx
// columns have been resolved by header name (so column reordering doesn't
// break the importer).
type Row struct {
	Sheet         string
	RowNumber     int // 1-based, matches the xlsx UI

	Folder            string
	TestinyID         string
	Title             string
	Owner             string
	CreatedAt         *time.Time
	CreatedBy         string
	ModifiedAt        *time.Time
	ModifiedBy        string
	Precondition      string
	Steps             string
	ExpectedResult    string
	FolderDescription string
	PriorityRaw       string // keep as string; MapPriority handles all forms
	TypeRaw           string
	Requirements      string
}

// Read returns every populated row from every non-summary sheet of a
// Testiny export, plus the list of sheets it skipped.
func Read(path string) (rows []Row, skipped []string, err error) {
	f, err := excelize.OpenFile(path)
	if err != nil {
		return nil, nil, fmt.Errorf("open xlsx: %w", err)
	}
	defer f.Close()

	for _, sheet := range f.GetSheetList() {
		if strings.EqualFold(sheet, "Summary") {
			skipped = append(skipped, sheet+" (summary sheet)")
			continue
		}
		sr, err := readSheet(f, sheet)
		if err != nil {
			return nil, nil, fmt.Errorf("sheet %q: %w", sheet, err)
		}
		if len(sr) == 0 {
			skipped = append(skipped, sheet+" (no rows)")
			continue
		}
		rows = append(rows, sr...)
	}
	return rows, skipped, nil
}

func readSheet(f *excelize.File, sheet string) ([]Row, error) {
	all, err := f.GetRows(sheet)
	if err != nil {
		return nil, err
	}
	if len(all) < 2 {
		return nil, nil
	}
	header := all[0]
	idx := map[string]int{}
	for i, h := range header {
		idx[strings.TrimSpace(h)] = i
	}
	cell := func(row []string, name string) string {
		i, ok := idx[name]
		if !ok || i >= len(row) {
			return ""
		}
		return strings.TrimSpace(row[i])
	}

	out := make([]Row, 0, len(all)-1)
	for ri, row := range all[1:] {
		// drop blank rows
		nonEmpty := false
		for _, c := range row {
			if strings.TrimSpace(c) != "" {
				nonEmpty = true
				break
			}
		}
		if !nonEmpty {
			continue
		}
		r := Row{
			Sheet:             sheet,
			RowNumber:         ri + 2, // +1 for header, +1 for 1-based
			Folder:            cell(row, "Folder"),
			TestinyID:         cell(row, "Test case ID"),
			Title:             cell(row, "Title"),
			Owner:             cell(row, "Owner"),
			CreatedAt:         parseExcelTime(cell(row, "Created at")),
			CreatedBy:         cell(row, "Created by"),
			ModifiedAt:        parseExcelTime(cell(row, "Modified at")),
			ModifiedBy:        cell(row, "Modified by"),
			Precondition:      cell(row, "Precondition"),
			Steps:             cell(row, "Steps"),
			ExpectedResult:    cell(row, "Expected result"),
			FolderDescription: cell(row, "Folder description"),
			PriorityRaw:       cell(row, "Priority"),
			TypeRaw:           cell(row, "Type"),
			Requirements:      cell(row, "Requirements"),
		}
		out = append(out, r)
	}
	return out, nil
}

// parseExcelTime accepts either an Excel serial number (as a string from
// excelize.GetRows, which has resolved values) or an RFC3339-ish string.
// Returns nil when empty/unparseable — timestamps are best-effort, not
// load-bearing for our import.
func parseExcelTime(s string) *time.Time {
	s = strings.TrimSpace(s)
	if s == "" {
		return nil
	}
	// excelize returns serial dates by default; parse as float if it looks numeric
	if n, err := strconv.ParseFloat(s, 64); err == nil {
		t, err := excelize.ExcelDateToTime(n, false)
		if err == nil {
			return &t
		}
	}
	// fall back to a few common formats
	for _, layout := range []string{
		time.RFC3339,
		"2006-01-02 15:04:05",
		"2006-01-02 15:04:05.999999",
		"01/02/2006 15:04:05",
		"2006-01-02",
	} {
		if t, err := time.Parse(layout, s); err == nil {
			return &t
		}
	}
	return nil
}

// JiraKeysFromRequirements extracts comma-separated Jira keys from the
// (rare) Requirements column.  Testiny stores them as a JSON array like
//   [{"key":"FIRM-6100", "summary":"...", "url":""}]
// — a tiny regex avoids pulling in a JSON parser for one cell.
func JiraKeysFromRequirements(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	var keys []string
	for {
		i := strings.Index(raw, `"key":"`)
		if i < 0 {
			break
		}
		raw = raw[i+len(`"key":"`):]
		j := strings.Index(raw, `"`)
		if j < 0 {
			break
		}
		k := strings.TrimSpace(raw[:j])
		if k != "" {
			keys = append(keys, k)
		}
		raw = raw[j:]
	}
	return strings.Join(keys, ",")
}
