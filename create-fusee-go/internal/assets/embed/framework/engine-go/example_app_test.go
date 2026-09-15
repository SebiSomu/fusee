package engine_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	engine "fusee"
	"fusee/evalexpr"
	"fusee/rustast"
)

func TestGoSSREndToEndAppIntegration(t *testing.T) {
	// 1. Setup Action Registry
	actionReg := engine.NewActionRegistry()
	actionReg.DefineAction("submitFeedback", func(args []any) (any, error) {
		var message string
		if len(args) > 0 {
			if m, ok := args[0].(map[string]any); ok {
				message, _ = m["message"].(string)
			}
		}
		return map[string]any{
			"ok":       true,
			"received": message,
		}, nil
	})

	// 2. Setup AST for rendering
	pageASTJSON := `{
		"type": "Root",
		"children": [
			{
				"type": "Element",
				"tag": "main",
				"props": [{"type": "Attribute", "name": "class", "value": "container"}],
				"children": [
					{
						"type": "Element",
						"tag": "h1",
						"props": [],
						"children": [
							{"type": "Interpolation", "expression": {"content": "title", "is_static": false}}
						]
					},
					{
						"type": "Element",
						"tag": "p",
						"props": [{"type": "Attribute", "name": "class", "value": "lead"}],
						"children": [
							{"type": "Text", "content": "Welcome to "},
							{"type": "Interpolation", "expression": {"content": "framework", "is_static": false}}
						]
					},
					{
						"type": "Element",
						"tag": "ul",
						"props": [{"type": "Attribute", "name": "id", "value": "items-list"}],
						"children": [
							{
								"type": "Element",
								"tag": "li",
								"props": [
									{
										"type": "Directive",
										"name": "for",
										"arg": {"source": "tags", "item": "tag"}
									}
								],
								"children": [
									{"type": "Interpolation", "expression": {"content": "tag", "is_static": false}}
								]
							}
						]
					}
				]
			}
		]
	}`

	pageAST, err := rustast.ParseAST([]byte(pageASTJSON))
	if err != nil {
		t.Fatalf("ParseAST failed: %v", err)
	}

	// 3. Setup Routes
	routes := []*engine.Route{
		engine.Compile("/", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return map[string]any{
					"title":     "Home Page",
					"framework": "Fusee Engine Go",
					"tags":      []any{"Go SSR", "Rust Parser", "Signals"},
				}, nil
			},
		}),
		engine.Compile("/users/[id]", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return map[string]any{
					"title":     fmt.Sprintf("User #%s", params["id"]),
					"framework": "Fusee Engine Go",
					"tags":      []any{"Profile", "Activity"},
				}, nil
			},
		}),
		engine.Compile("/redirect-me", &engine.Module{
			Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
				return nil, engine.Redirect(http.StatusTemporaryRedirect, "/target")
			},
		}),
	}

	// 4. Setup Render Function
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

		bodyHTML, err := engine.Render(pageAST, scope)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		hydration, _ := engine.RenderDehydrationScript(nil, nil)

		fullDoc := fmt.Sprintf(`<!DOCTYPE html><html><head><title>%s</title></head><body><div id="app">%s</div>%s</body></html>`,
			scope["title"], bodyHTML, hydration)

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fullDoc))
	}

	// 5. Create Dispatcher & Test Server
	dispatcher := engine.NewDispatcher(engine.Config{
		Routes:          routes,
		Actions:         actionReg,
		Render:          renderFunc,
		ActionsBasePath: "/__fusee/actions",
	})

	ts := httptest.NewServer(dispatcher)
	defer ts.Close()

	// ─── Test 1: GET / (SSR Render & Hydration) ───
	{
		res, err := http.Get(ts.URL + "/")
		if err != nil {
			t.Fatalf("GET / error: %v", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", res.StatusCode)
		}
		body, _ := io.ReadAll(res.Body)
		html := string(body)

		if !strings.Contains(html, "<title>Home Page</title>") {
			t.Errorf("missing title in html: %s", html)
		}
		if !strings.Contains(html, "Welcome to <!--f-bind:") {
			t.Errorf("missing reactive binding comment in html: %s", html)
		}
		if !strings.Contains(html, "Fusee Engine Go") {
			t.Errorf("missing rendered text in html: %s", html)
		}
		if !strings.Contains(html, "<!--f-for:") || !strings.Contains(html, "Go SSR") {
			t.Errorf("missing for directive loop items in html: %s", html)
		}
		if !strings.Contains(html, `<script id="__FUSEE_DATA__">`) {
			t.Errorf("missing hydration script in html: %s", html)
		}
	}

	// ─── Test 2: GET /users/123 (Route Params in SSR) ───
	{
		res, err := http.Get(ts.URL + "/users/123")
		if err != nil {
			t.Fatalf("GET /users/123 error: %v", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			t.Fatalf("expected 200, got %d", res.StatusCode)
		}
		body, _ := io.ReadAll(res.Body)
		html := string(body)

		if !strings.Contains(html, "User #123") {
			t.Errorf("expected User #123 in html, got: %s", html)
		}
	}

	// ─── Test 3: POST /__fusee/actions/submitFeedback (Server Action) ───
	{
		reqBody, _ := json.Marshal(map[string]any{
			"args": []any{
				map[string]any{"message": "Fusee Go SSR is super fast!"},
			},
		})
		req, _ := http.NewRequest(http.MethodPost, ts.URL+"/__fusee/actions/submitFeedback", bytes.NewReader(reqBody))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Requested-With", "XMLHttpRequest")

		client := &http.Client{}
		res, err := client.Do(req)
		if err != nil {
			t.Fatalf("Action POST error: %v", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 from action, got %d", res.StatusCode)
		}
		var result struct {
			Data struct {
				Ok       bool   `json:"ok"`
				Received string `json:"received"`
			} `json:"data"`
		}
		if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
			t.Fatalf("failed to decode action response: %v", err)
		}
		if !result.Data.Ok || result.Data.Received != "Fusee Go SSR is super fast!" {
			t.Errorf("unexpected action response: %+v", result)
		}
	}

	// ─── Test 4: Redirect handling ───
	{
		client := &http.Client{
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		}
		res, err := client.Get(ts.URL + "/redirect-me")
		if err != nil {
			t.Fatalf("GET /redirect-me error: %v", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusTemporaryRedirect {
			t.Errorf("expected 307 redirect, got %d", res.StatusCode)
		}
		if loc := res.Header.Get("Location"); loc != "/target" {
			t.Errorf("expected Location /target, got %s", loc)
		}
	}

	// ─── Test 5: 404 for unknown route ───
	{
		res, err := http.Get(ts.URL + "/non-existent-path")
		if err != nil {
			t.Fatalf("GET /non-existent-path error: %v", err)
		}
		defer res.Body.Close()

		if res.StatusCode != http.StatusNotFound {
			t.Errorf("expected 404, got %d", res.StatusCode)
		}
	}
}
