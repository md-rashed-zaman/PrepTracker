package integration

import (
	"net/http"
	"strings"
	"testing"

	"github.com/md-rashed-zaman/PrepTracker/services/api/internal/testutil"
)

func TestDocsEndpoints(t *testing.T) {
	dbURL := testutil.RequireDBURL(t)
	testutil.MigrateUp(t, dbURL)
	pool := testutil.OpenPool(t, dbURL)
	testutil.ResetDB(t, pool)

	r := newTestRouter(pool)

	openapi := doJSON(t, r, "GET", "/openapi.yaml", nil, "")
	if openapi.Code != http.StatusOK {
		t.Fatalf("openapi status=%d body=%s", openapi.Code, openapi.Body.String())
	}
	if !strings.Contains(openapi.Body.String(), "openapi: 3.0.3") {
		t.Fatalf("unexpected openapi body: %s", openapi.Body.String())
	}

	docs := doJSON(t, r, "GET", "/docs", nil, "")
	if docs.Code != http.StatusOK {
		t.Fatalf("docs status=%d body=%s", docs.Code, docs.Body.String())
	}
	if !strings.Contains(docs.Body.String(), "swagger-ui") {
		t.Fatalf("unexpected docs body: %s", docs.Body.String())
	}
}
