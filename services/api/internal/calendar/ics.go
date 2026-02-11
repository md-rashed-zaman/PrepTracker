package calendar

import (
	"fmt"
	"strings"
	"time"
)

type Event struct {
	UID         string
	Summary     string
	Description string
	URL         string
	Start       time.Time
	End         time.Time
	AllDay      bool
}

func BuildICS(calName string, events []Event) string {
	var b strings.Builder
	w := func(line string) {
		// RFC 5545 requires CRLF line endings.
		b.WriteString(line)
		b.WriteString("\r\n")
	}
	w("BEGIN:VCALENDAR")
	w("VERSION:2.0")
	w("PRODID:-//PrepTracker//PrepTracker//EN")
	if calName != "" {
		w("X-WR-CALNAME:" + escapeText(calName))
	}
	w("CALSCALE:GREGORIAN")

	now := time.Now().UTC().Format("20060102T150405Z")
	for _, e := range events {
		w("BEGIN:VEVENT")
		w("UID:" + escapeText(e.UID))
		w("DTSTAMP:" + now)
		if e.AllDay {
			start := e.Start.Format("20060102")
			end := e.Start.AddDate(0, 0, 1).Format("20060102")
			w("DTSTART;VALUE=DATE:" + start)
			w("DTEND;VALUE=DATE:" + end)
		} else {
			start := e.Start.UTC().Format("20060102T150405Z")
			end := e.End.UTC().Format("20060102T150405Z")
			w("DTSTART:" + start)
			w("DTEND:" + end)
		}
		w("SUMMARY:" + escapeText(e.Summary))
		if e.Description != "" {
			w("DESCRIPTION:" + escapeText(e.Description))
		}
		if e.URL != "" {
			w("URL:" + escapeText(e.URL))
		}
		w("END:VEVENT")
	}
	w("END:VCALENDAR")
	return b.String()
}

// escapeText escapes iCalendar TEXT values.
// See RFC 5545 section 3.3.11.
func escapeText(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, "\r\n", "\\n")
	s = strings.ReplaceAll(s, "\n", "\\n")
	s = strings.ReplaceAll(s, "\r", "\\n")
	s = strings.ReplaceAll(s, ";", "\\;")
	s = strings.ReplaceAll(s, ",", "\\,")
	return s
}

func EventSummary(title string) string {
	title = strings.TrimSpace(title)
	if title == "" {
		return "PrepTracker review"
	}
	return fmt.Sprintf("Review: %s", title)
}
