package integration

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/testutil"
)

func TestReviewSchedulesNextDue(t *testing.T) {
	dbURL := testutil.RequireDBURL(t)
	testutil.MigrateUp(t, dbURL)
	pool := testutil.OpenPool(t, dbURL)
	testutil.ResetDB(t, pool)

	r := newTestRouter(pool)

	regResp := doJSON(t, r, "POST", "/api/v1/auth/register", map[string]any{
		"email":             "b@example.com",
		"password":          "pass1234",
		"timezone":          "America/New_York",
		"min_interval_days": 7,
	}, "")
	if regResp.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regResp.Code, regResp.Body.String())
	}
	var tokens map[string]any
	_ = json.Unmarshal(regResp.Body.Bytes(), &tokens)
	access := tokens["access_token"].(string)

	probResp := doJSON(t, r, "POST", "/api/v1/problems/", map[string]any{
		"url":        "https://leetcode.com/problems/two-sum/",
		"title":      "Two Sum",
		"platform":   "leetcode",
		"difficulty": "easy",
		"topics":     []string{"array", "hashmap"},
	}, access)
	if probResp.Code != http.StatusCreated {
		t.Fatalf("create problem status=%d body=%s", probResp.Code, probResp.Body.String())
	}
	var p map[string]any
	_ = json.Unmarshal(probResp.Body.Bytes(), &p)
	problemID := p["id"].(string)

	dueResp := doJSON(t, r, "GET", "/api/v1/reviews/due?window_days=0", nil, access)
	if dueResp.Code != http.StatusOK {
		t.Fatalf("due status=%d body=%s", dueResp.Code, dueResp.Body.String())
	}

	reviewResp := doJSON(t, r, "POST", "/api/v1/reviews/", map[string]any{
		"problem_id":     problemID,
		"grade":          3,
		"time_spent_sec": 600,
		"source":         "daily_review",
	}, access)
	if reviewResp.Code != http.StatusOK {
		t.Fatalf("post review status=%d body=%s", reviewResp.Code, reviewResp.Body.String())
	}
	var out map[string]any
	_ = json.Unmarshal(reviewResp.Body.Bytes(), &out)
	nextDue, ok := out["next_due_at"].(string)
	if !ok || nextDue == "" {
		t.Fatalf("expected next_due_at in response, got: %v", out)
	}
	parsed, err := time.Parse(time.RFC3339Nano, nextDue)
	if err != nil {
		parsed, err = time.Parse(time.RFC3339, nextDue)
	}
	if err != nil {
		t.Fatalf("failed to parse next_due_at: %v", err)
	}
	if !parsed.After(time.Now().UTC()) {
		t.Fatalf("expected next due in future, got %s", parsed)
	}
}

func TestCalendarUsesUserDueTime(t *testing.T) {
	dbURL := testutil.RequireDBURL(t)
	testutil.MigrateUp(t, dbURL)
	pool := testutil.OpenPool(t, dbURL)
	testutil.ResetDB(t, pool)

	r := newTestRouter(pool)

	regResp := doJSON(t, r, "POST", "/api/v1/auth/register", map[string]any{
		"email":             "c@example.com",
		"password":          "pass1234",
		"timezone":          "America/New_York",
		"min_interval_days": 1,
	}, "")
	if regResp.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regResp.Code, regResp.Body.String())
	}
	var tokens map[string]any
	_ = json.Unmarshal(regResp.Body.Bytes(), &tokens)
	access := tokens["access_token"].(string)

	settingsResp := doJSON(t, r, "PATCH", "/api/v1/users/me/settings", map[string]any{
		"due_hour_local":   21,
		"due_minute_local": 15,
	}, access)
	if settingsResp.Code != http.StatusOK {
		t.Fatalf("settings status=%d body=%s", settingsResp.Code, settingsResp.Body.String())
	}

	probResp := doJSON(t, r, "POST", "/api/v1/problems/", map[string]any{
		"url":   "https://leetcode.com/problems/valid-parentheses/",
		"title": "Valid Parentheses",
	}, access)
	if probResp.Code != http.StatusCreated {
		t.Fatalf("create problem status=%d body=%s", probResp.Code, probResp.Body.String())
	}

	rotateResp := doJSON(t, r, "POST", "/api/v1/integrations/calendar/ics/rotate", map[string]any{}, access)
	if rotateResp.Code != http.StatusOK {
		t.Fatalf("rotate status=%d body=%s", rotateResp.Code, rotateResp.Body.String())
	}
	var rot map[string]any
	_ = json.Unmarshal(rotateResp.Body.Bytes(), &rot)
	icsURL := rot["subscription_url"].(string)

	icsResp := doJSON(t, r, "GET", icsURL, nil, "")
	if icsResp.Code != http.StatusOK {
		t.Fatalf("ics status=%d body=%s", icsResp.Code, icsResp.Body.String())
	}
	if !bytes.Contains(icsResp.Body.Bytes(), []byte("DTSTART:")) {
		t.Fatalf("expected timed DTSTART in ics, got: %s", icsResp.Body.String())
	}
	if bytes.Contains(icsResp.Body.Bytes(), []byte("DTSTART;VALUE=DATE:")) {
		t.Fatalf("expected timed event, got all-day: %s", icsResp.Body.String())
	}
}

func TestEmptyListsReturnJSONArrays(t *testing.T) {
	dbURL := testutil.RequireDBURL(t)
	testutil.MigrateUp(t, dbURL)
	pool := testutil.OpenPool(t, dbURL)
	testutil.ResetDB(t, pool)

	r := newTestRouter(pool)

	regResp := doJSON(t, r, "POST", "/api/v1/auth/register", map[string]any{
		"email":    "empty@example.com",
		"password": "pass1234",
	}, "")
	if regResp.Code != http.StatusCreated {
		t.Fatalf("register status=%d body=%s", regResp.Code, regResp.Body.String())
	}
	var tokens map[string]any
	_ = json.Unmarshal(regResp.Body.Bytes(), &tokens)
	access := tokens["access_token"].(string)

	problemsResp := doJSON(t, r, "GET", "/api/v1/problems/", nil, access)
	if problemsResp.Code != http.StatusOK {
		t.Fatalf("problems status=%d body=%s", problemsResp.Code, problemsResp.Body.String())
	}
	if strings.TrimSpace(problemsResp.Body.String()) != "[]" {
		t.Fatalf("expected [] for problems list, got: %s", problemsResp.Body.String())
	}

	dueResp := doJSON(t, r, "GET", "/api/v1/reviews/due?window_days=14", nil, access)
	if dueResp.Code != http.StatusOK {
		t.Fatalf("due status=%d body=%s", dueResp.Code, dueResp.Body.String())
	}
	if strings.TrimSpace(dueResp.Body.String()) != "[]" {
		t.Fatalf("expected [] for due list, got: %s", dueResp.Body.String())
	}
}
