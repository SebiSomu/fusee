package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"

	engine "fusee"
	"fusee/evalexpr"
	"fusee/rustast"
)

func main() {
	port := flag.Int("port", 3000, "Port to listen on")
	distDir := flag.String("dist", "./dist", "Path to dist directory for static assets")
	flag.Parse()

	// 1. Initialize Server Actions Registry
	actionReg := engine.NewActionRegistry()
	actionReg.DefineAction("submitContact", func(args []any) (any, error) {
		var name, email string
		if len(args) > 0 {
			if m, ok := args[0].(map[string]any); ok {
				name, _ = m["name"].(string)
				email, _ = m["email"].(string)
			}
		}
		log.Printf("[Action] submitContact received from %s <%s>", name, email)
		return map[string]any{
			"success": true,
			"message": fmt.Sprintf("Thank you, %s! We received your message.", name),
		}, nil
	})

	actionReg.DefineAction("submitFeedback", func(args []any) (any, error) {
		var message string
		if len(args) > 0 {
			if m, ok := args[0].(map[string]any); ok {
				message, _ = m["message"].(string)
			}
		}
		log.Printf("[Action] submitFeedback received: %q", message)
		return map[string]any{
			"ok":       true,
			"received": message,
		}, nil
	})

	// 2. Define Sample Component ASTs
	aboutASTJSON := `{
		"type": "Root",
		"children": [
			{
				"type": "Element",
				"tag": "div",
				"props": [{"type": "Attribute", "name": "class", "value": "page ssr-page"}],
				"children": [
					{
						"type": "Element",
						"tag": "h1",
						"props": [{"type": "Attribute", "name": "style", "value": "color: #60a5fa;"}],
						"children": [
							{"type": "Interpolation", "expression": {"content": "title", "is_static": false}}
						]
					},
					{
						"type": "Element",
						"tag": "p",
						"props": [{"type": "Attribute", "name": "class", "value": "subtitle"}],
						"children": [
							{"type": "Text", "content": "Status: "},
							{"type": "Interpolation", "expression": {"content": "status", "is_static": false}}
						]
					},
					{
						"type": "Element",
						"tag": "div",
						"props": [{"type": "Attribute", "name": "class", "value": "demo-card"}],
						"children": [
							{
								"type": "Element",
								"tag": "h2",
								"props": [],
								"children": [{"type": "Text", "content": "Server-Rendered Items"}]
							},
							{
								"type": "Element",
								"tag": "ul",
								"props": [{"type": "Attribute", "name": "style", "value": "margin-left: 1.5rem;"}],
								"children": [
									{
										"type": "Element",
										"tag": "li",
										"props": [
											{
												"type": "Directive",
												"name": "for",
												"arg": {"source": "items", "item": "item"}
											}
										],
										"children": [
											{"type": "Interpolation", "expression": {"content": "item", "is_static": false}}
										]
									}
								]
							}
						]
					}
				]
			}
		]
	}`

	aboutAST, err := rustast.ParseAST([]byte(aboutASTJSON))
	if err != nil {
		log.Fatalf("Failed to parse sample AST: %v", err)
	}

	// 3. Define Routes & Loaders
	routes := []*engine.Route{
		engine.Compile("/", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return map[string]any{
					"title":   "Welcome to Fusee SSR",
					"status":  "SSR Active",
					"count":   10,
					"items":   []any{"High Performance Signals", "Go SSR Engine", "Rust AST Parser", "Selective Hydration"},
					"version": "2.0.0",
				}, nil
			},
		}),
		engine.Compile("/ssr-demo", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return map[string]any{
					"title":  "Fusee SSR & Hydration Demo",
					"status": "Pre-rendered by Go SSR Engine",
					"count":  42,
					"items":  []any{"Fast Go Dispatcher", "Rust Template Parser", "Signal State Hydration", "Server Actions"},
				}, nil
			},
		}),
		engine.Compile("/about", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return map[string]any{
					"title":  "About Fusee",
					"status": "Loaded on Server (Go)",
					"count":  5,
					"items":  []any{"Signals-first reactivity", "Zero runtime overhead", "Streaming SSR"},
				}, nil
			},
		}),
		engine.Compile("/users/[id]", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				id := params["id"]
				return map[string]any{
					"title":  fmt.Sprintf("User Profile #%s", id),
					"status": fmt.Sprintf("Fetched user %s from server", id),
					"count":  1,
					"items":  []any{"Profile Details", "Recent Activity", "Settings"},
				}, nil
			},
		}),
	}

	// 4. Configure Render Function
	renderFunc := func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		scope := evalexpr.Scope{}
		if m, ok := data.(map[string]any); ok {
			for k, v := range m {
				scope[k] = v
			}
		}
		for k, v := range params {
			scope[k] = v
		}

		bodyHTML, err := engine.Render(aboutAST, scope)
		if err != nil {
			http.Error(w, fmt.Sprintf("Render Error: %v", err), http.StatusInternalServerError)
			return
		}

		signals := map[string][]any{}
		if c, ok := scope["count"]; ok {
			signals["count"] = []any{c}
		}
		if s, ok := scope["status"]; ok {
			signals["status"] = []any{s}
		}

		hydrationScript, _ := engine.RenderDehydrationScript(nil, signals)

		pageTitle := "Fusee SSR App"
		if t, ok := scope["title"].(string); ok {
			pageTitle = t
		}

		fullHTML := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>%s</title>
    <link rel="icon" href="/fusee-logo.svg" type="image/svg+xml" />
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body { font-family: system-ui, sans-serif; background: #0f0f13; color: #e8e8f0; min-height: 100vh; }
      nav { display: flex; flex-wrap: wrap; gap: 1rem; padding: 1rem 2rem; background: #1a1a24; border-bottom: 1px solid #2a2a3a; }
      nav a { color: #ff3333; text-decoration: none; font-weight: 500; }
      .content-wrap { padding: 2rem; max-width: 800px; margin: 0 auto; width: 100%%; }
      .demo-card { background: #13131d; border: 1px solid #2a2a3a; border-radius: 12px; padding: 1.5rem; margin-bottom: 1.5rem; }
      .primary-btn { padding: 0.6rem 1.25rem; border: none; background: #3b82f6; color: #fff; font-weight: 600; border-radius: 6px; cursor: pointer; }
      .cmp-btn { padding: 0.45rem 1.1rem; border-radius: 6px; border: 1px solid #2a2a3a; background: #0f0f1a; color: #e8e8f0; cursor: pointer; }
      .cmp-input { width: 100%%; padding: 0.5rem 0.75rem; background: #0f0f1a; border: 1px solid #2a2a3a; border-radius: 6px; color: #e8e8f0; }
      .badge { display: inline-block; padding: 0.2rem 0.65rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; }
      .badge-blue { background: rgba(96, 165, 250, 0.15); color: #60a5fa; }
      .badge-red { background: rgba(255, 51, 51, 0.12); color: #ff3333; }
      .info-section { background: #0f0f1a; border: 1px solid #2a2a3a; border-radius: 12px; padding: 1.5rem; margin-top: 2rem; }
      .info-section h2 { color: #34d399; margin-bottom: 1rem; font-size: 1.1rem; }
      .info-section ul { margin-left: 1.5rem; }
      .info-section li { color: #aaa; margin-bottom: 0.5rem; }
    </style>
</head>
<body>
    <div id="app">
        <div class="root-layout">
            <nav>
                <a href="/" f-link>Home</a>
                <a href="/about" f-link>About</a>
                <a href="/ssr-demo" f-link style="color: #60a5fa;">🚀 SSR Demo</a>
                <a href="/users" f-link style="color: #f59e0b;">👥 Users</a>
            </nav>
            <main class="content-wrap">
                <div data-router-view>%s</div>
            </main>
        </div>
    </div>
    %s
    <script type="module" src="/app/main.js"></script>
</body>
</html>`, pageTitle, bodyHTML, hydrationScript)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fullHTML))
	}

	absDist := *distDir
	if absDist == "./dist" || absDist == "dist" {
		rootDir := "."
		for _, candidate := range []string{".", "..", "../..", "../../.."} {
			if _, err := os.Stat(filepath.Join(candidate, "package.json")); err == nil {
				rootDir = candidate
				break
			}
		}
		absRoot, _ := filepath.Abs(rootDir)
		absDist = filepath.Join(absRoot, "dist")
		if _, err := os.Stat(absDist); os.IsNotExist(err) {
			absDist = absRoot // Serve direct source modules (/app/..., /framework/...) when dist/ is not built
		}
	} else {
		absDist, _ = filepath.Abs(absDist)
	}
	log.Printf("[Static Assets] Serving files from: %s", absDist)

	// 5. Create Dispatcher
	dispatcher := engine.NewDispatcher(engine.Config{
		DistDir:         absDist,
		Routes:          routes,
		Actions:         actionReg,
		Render:          renderFunc,
		ActionsBasePath: "/__fusee/actions",
	})

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("Fusee Go SSR Server listening on http://localhost:%d", *port)
	if err := http.ListenAndServe(addr, dispatcher); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}
