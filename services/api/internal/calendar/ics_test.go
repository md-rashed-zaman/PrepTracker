package calendar

import (
	"strings"
	"testing"
	"time"
)

func TestBuildICSAllDayEvent(t *testing.T) {
	loc := time.FixedZone("X", 0)
	events := []Event{
		{
			UID:     "u1",
			Summary: "Review: A, B; C",
			Start:   time.Date(2026, 2, 8, 0, 0, 0, 0, loc),
			End:     time.Date(2026, 2, 8, 0, 30, 0, 0, loc),
			AllDay:  true,
			URL:     "https://example.com/a?b=c",
		},
	}
	out := BuildICS("PrepTracker", events)
	if !strings.Contains(out, "BEGIN:VEVENT\r\n") {
		t.Fatalf("expected VEVENT")
	}
	if !strings.Contains(out, "DTSTART;VALUE=DATE:20260208\r\n") {
		t.Fatalf("expected DTSTART date, got: %s", out)
	}
	if !strings.Contains(out, "SUMMARY:Review: A\\, B\\; C\r\n") {
		t.Fatalf("expected escaped summary, got: %s", out)
	}
	if !strings.HasSuffix(out, "END:VCALENDAR\r\n") {
		t.Fatalf("expected CRLF ending")
	}
}
