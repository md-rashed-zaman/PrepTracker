package docs

import (
	"html/template"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

type Handler struct {
	specPath string
}

func NewHandler(specPath string) *Handler {
	return &Handler{specPath: resolveSpecPath(specPath)}
}

func (h *Handler) OpenAPIYAML(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile(h.specPath)
	if err != nil {
		http.Error(w, "openapi spec not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(b)
}

var swaggerTmpl = template.Must(template.New("swagger").Parse(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>PrepTracker API Docs</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
    <style>
      :root{
        --pf-bg: #fbf7ef;
        --pf-paper: #ffffff;
        --pf-ink: #101828;
        --pf-muted: rgba(16,24,40,.68);
        --pf-line: rgba(16,24,40,.14);
        --pf-shadow: 0 16px 40px rgba(16,24,40,.10);
        --pf-accent: #0f766e;
        --pf-accent-2: #a16207;
      }

      html, body { height: 100%; }
      body {
        margin: 0;
        color: var(--pf-ink);
        background:
          radial-gradient(1200px 600px at 15% -5%, rgba(15,118,110,.10), transparent 60%),
          radial-gradient(900px 520px at 100% 0%, rgba(161,98,7,.08), transparent 55%),
          repeating-linear-gradient(0deg, rgba(16,24,40,.03), rgba(16,24,40,.03) 1px, transparent 1px, transparent 10px),
          var(--pf-bg);
        font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      }

      /* Hide Swagger's default top bar; we render our own header. */
      .topbar { display: none; }

      .pf-header{
        position: sticky;
        top: 0;
        z-index: 10;
        border-bottom: 1px solid var(--pf-line);
        background: rgba(251,247,239,.78);
        backdrop-filter: blur(10px);
      }
      .pf-header-inner{
        max-width: 1160px;
        margin: 0 auto;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
      }
      .pf-brand{
        display: flex;
        flex-direction: column;
        line-height: 1.05;
        gap: 3px;
      }
      .pf-kicker{
        font-size: 12px;
        letter-spacing: .14em;
        text-transform: uppercase;
        color: var(--pf-muted);
      }
      .pf-title{
        font-family: "Fraunces", ui-serif, Georgia, "Times New Roman", Times, serif;
        font-size: 22px;
        font-weight: 600;
        color: var(--pf-ink);
      }
      .pf-nav{
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .pf-nav a{
        text-decoration: none;
        color: var(--pf-ink);
        border: 1px solid var(--pf-line);
        background: rgba(255,255,255,.65);
        padding: 8px 10px;
        border-radius: 999px;
        font-size: 13px;
        transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
      }
      .pf-nav a:hover{
        transform: translateY(-1px);
        box-shadow: 0 10px 22px rgba(16,24,40,.12);
        border-color: rgba(15,118,110,.45);
      }
      .pf-nav a:focus-visible{
        outline: 3px solid rgba(15,118,110,.25);
        outline-offset: 2px;
      }

      .pf-main{
        max-width: 1160px;
        margin: 0 auto;
        padding: 16px 20px 56px 20px;
      }

      /* Swagger UI theme polish */
      .swagger-ui{ color: var(--pf-ink); }
      .swagger-ui, .swagger-ui input, .swagger-ui select, .swagger-ui textarea, .swagger-ui .btn{
        font-family: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
      }
      .swagger-ui .info .title{ color: var(--pf-ink); }
      .swagger-ui .info a{ color: var(--pf-accent); }
      .swagger-ui .scheme-container{
        border: 1px solid var(--pf-line);
        background: rgba(255,255,255,.75);
        border-radius: 14px;
        box-shadow: var(--pf-shadow);
      }
      .swagger-ui .opblock{
        border: 1px solid var(--pf-line);
        border-radius: 16px;
        box-shadow: 0 12px 28px rgba(16,24,40,.08);
      }
      .swagger-ui .opblock .opblock-summary{
        border-bottom: 1px solid rgba(16,24,40,.08);
      }
      .swagger-ui .opblock .opblock-summary-method{
        width: 78px;
        text-align: center;
        letter-spacing: .08em;
      }
      .swagger-ui .opblock.opblock-get{
        border-color: rgba(15,118,110,.28);
      }
      .swagger-ui .opblock.opblock-get .opblock-summary{
        background: rgba(15,118,110,.06);
      }
      .swagger-ui .opblock.opblock-get .opblock-summary-method{
        background: rgba(15,118,110,.92);
      }
      .swagger-ui .opblock.opblock-post{
        border-color: rgba(161,98,7,.28);
      }
      .swagger-ui .opblock.opblock-post .opblock-summary{
        background: rgba(161,98,7,.06);
      }
      .swagger-ui .opblock.opblock-post .opblock-summary-method{
        background: rgba(161,98,7,.92);
      }
      .swagger-ui .opblock.opblock-patch{
        border-color: rgba(2,132,199,.26);
      }
      .swagger-ui .opblock.opblock-patch .opblock-summary{
        background: rgba(2,132,199,.06);
      }
      .swagger-ui .opblock.opblock-patch .opblock-summary-method{
        background: rgba(2,132,199,.92);
      }
      .swagger-ui .opblock.opblock-delete{
        border-color: rgba(180,35,24,.26);
      }
      .swagger-ui .opblock.opblock-delete .opblock-summary{
        background: rgba(180,35,24,.06);
      }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method{
        background: rgba(180,35,24,.92);
      }
      .swagger-ui .opblock .opblock-summary-method{
        border-radius: 12px;
      }
      .swagger-ui .opblock-tag{
        border-bottom: 1px solid rgba(16,24,40,.10);
      }
      .swagger-ui .btn.authorize{
        border-color: rgba(15,118,110,.55);
        color: var(--pf-accent);
      }
      .swagger-ui .btn.authorize svg{ fill: var(--pf-accent); }
      .swagger-ui .btn:hover{
        border-color: rgba(15,118,110,.55);
      }
      .swagger-ui .model-box, .swagger-ui section.models{
        border: 1px solid rgba(16,24,40,.10);
        border-radius: 14px;
      }
      .swagger-ui table tbody tr td{
        border-top: 1px solid rgba(16,24,40,.08);
      }
      .swagger-ui .response-col_status{
        font-variant-numeric: tabular-nums;
      }

      @media (max-width: 640px){
        .pf-header-inner{ padding: 14px 14px; }
        .pf-main{ padding: 12px 14px 44px 14px; }
      }
    </style>
  </head>
  <body>
    <header class="pf-header">
      <div class="pf-header-inner">
        <div class="pf-brand">
          <div class="pf-kicker">PrepTracker</div>
          <div class="pf-title">API Docs</div>
        </div>
        <nav class="pf-nav" aria-label="Docs navigation">
          <a href="/openapi.yaml">OpenAPI YAML</a>
          <a href="https://github.com/md-rashed-zaman/PrepTracker" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </div>
    </header>
    <main class="pf-main">
      <div id="swagger-ui"></div>
    </main>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = () => {
        SwaggerUIBundle({
          url: {{.SpecURL}},
          dom_id: "#swagger-ui",
          deepLinking: true,
          persistAuthorization: true,
          displayRequestDuration: true
        });
      };
    </script>
  </body>
</html>`))

func (h *Handler) SwaggerUI(w http.ResponseWriter, r *http.Request) {
	specURL := "/openapi.yaml"
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_ = swaggerTmpl.Execute(w, map[string]any{
		"SpecURL": template.JS(strconvQuote(specURL)),
	})
}

func strconvQuote(s string) string {
	// Minimal safe JS string quoting without pulling extra deps.
	out := `"` + template.JSEscapeString(s) + `"`
	return out
}

func resolveSpecPath(specPath string) string {
	specPath = strings.TrimSpace(specPath)
	if specPath != "" {
		return specPath
	}

	// Common cases:
	// - Local dev from repo root: ./openapi/preptracker.v1.yaml
	// - Tests run from a package dir: walk up to repo root.
	cwd, err := os.Getwd()
	if err == nil {
		candidates := []string{
			filepath.Join(cwd, "openapi", "preptracker.v1.yaml"),
		}
		if root := findRepoRoot(cwd); root != "" {
			candidates = append(candidates, filepath.Join(root, "openapi", "preptracker.v1.yaml"))
		}
		for _, p := range candidates {
			if _, err := os.Stat(p); err == nil {
				return p
			}
		}
	}
	return "./openapi/preptracker.v1.yaml"
}

func findRepoRoot(start string) string {
	dir := start
	for i := 0; i < 20; i++ {
		if _, err := os.Stat(filepath.Join(dir, "go.mod")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			break
		}
		dir = parent
	}
	return ""
}
