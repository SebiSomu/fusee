package engine_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	engine "fusee"
	"fusee/evalexpr"
	"fusee/rustast"
)

// ─── helpers ─────────────────────────────────────────────────────────────────

func buildRoot(children []*rustast.Node) *rustast.Node {
	return &rustast.Node{
		Type: rustast.NodeRoot,
		Root: &rustast.RootNode{
			Children: children,
			Hoisted:  []int{},
		},
	}
}

func textNode(content string) *rustast.Node {
	return &rustast.Node{
		Type: rustast.NodeText,
		Text: &rustast.TextNode{Content: content, IsStatic: true},
	}
}

func emptyLoc() rustast.Loc { return rustast.Loc{} }

// ─── render tests ────────────────────────────────────────────────────────────

func TestRenderStaticText(t *testing.T) {
	root := buildRoot([]*rustast.Node{textNode("Hello, world!")})
	got, err := engine.Render(root, evalexpr.Scope{})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if got != "Hello, world!" {
		t.Errorf("got %q, want %q", got, "Hello, world!")
	}
}

func TestRenderInterpolation(t *testing.T) {
	root := buildRoot([]*rustast.Node{
		{
			Type: rustast.NodeInterpolation,
			Interpolation: &rustast.InterpolationNode{
				Expression: rustast.Expression{Content: "name", IsStatic: false},
			},
		},
	})
	got, err := engine.Render(root, evalexpr.Scope{"name": "Alice"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.Contains(got, "Alice") {
		t.Errorf("expected 'Alice' in output, got %q", got)
	}
	if !strings.Contains(got, "<!--f-bind:") {
		t.Errorf("expected anchor comment, got %q", got)
	}
}

func TestRenderElement(t *testing.T) {
	href := "example.com"
	root := buildRoot([]*rustast.Node{
		{
			Type: rustast.NodeElement,
			Element: &rustast.ElementNode{
				Tag: "a",
				Props: []*rustast.Prop{
					{
						Type:      rustast.PropAttribute,
						Attribute: &rustast.AttributeNode{Name: "href", Value: &href},
					},
				},
				Children: []*rustast.Node{textNode("click me")},
			},
		},
	})
	got, err := engine.Render(root, evalexpr.Scope{})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	want := `<a href="example.com">click me</a>`
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestRenderIf_True(t *testing.T) {
	root := buildRoot([]*rustast.Node{
		{
			Type: rustast.NodeIf,
			If: &rustast.IfNode{
				Branches: []rustast.Branch{
					{
						Condition: &rustast.Expression{Content: "show"},
						Node:      textNode("visible"),
					},
				},
			},
		},
	})
	got, err := engine.Render(root, evalexpr.Scope{"show": true})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.Contains(got, "visible") {
		t.Errorf("expected 'visible', got %q", got)
	}
	if !strings.Contains(got, "<!--f-if:") {
		t.Errorf("expected f-if anchor, got %q", got)
	}
}

func TestRenderIf_False(t *testing.T) {
	root := buildRoot([]*rustast.Node{
		{
			Type: rustast.NodeIf,
			If: &rustast.IfNode{
				Branches: []rustast.Branch{
					{
						Condition: &rustast.Expression{Content: "show"},
						Node:      textNode("visible"),
					},
				},
			},
		},
	})
	got, err := engine.Render(root, evalexpr.Scope{"show": false})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if strings.Contains(got, "visible") {
		t.Errorf("expected NO 'visible' when show=false, got %q", got)
	}
}

func TestRenderFor(t *testing.T) {
	root := buildRoot([]*rustast.Node{
		{
			Type: rustast.NodeElement,
			Element: &rustast.ElementNode{
				Tag: "span",
				Props: []*rustast.Prop{
					{
						Type: rustast.PropDirective,
						Directive: &rustast.DirectiveNode{
							Name: "for",
							Arg:  &rustast.ForArg{Item: "item", Source: "items"},
						},
					},
				},
				Children: []*rustast.Node{
					{
						Type: rustast.NodeInterpolation,
						Interpolation: &rustast.InterpolationNode{
							Expression: rustast.Expression{Content: "item"},
						},
					},
				},
			},
		},
	})
	got, err := engine.Render(root, evalexpr.Scope{
		"items": []any{"one", "two", "three"},
	})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	for _, word := range []string{"one", "two", "three"} {
		if !strings.Contains(got, word) {
			t.Errorf("expected %q in output, got %q", word, got)
		}
	}
	if !strings.Contains(got, "<!--f-for:") {
		t.Errorf("expected f-for anchor, got %q", got)
	}
}

// TestRenderFromJSON tests ParseAST→Render with a JSON AST matching what fusee-ast produces.
func TestRenderFromJSON(t *testing.T) {
	astJSON := `{
		"type": "Root",
		"children": [{
			"type": "Element",
			"id": 1,
			"tag": "p",
			"props": [],
			"children": [
				{"type":"Text","content":"Hello ","is_static":true,"loc":{"start":{"line":0,"col":0,"offset":0},"end":{"line":0,"col":0,"offset":0}}},
				{"type":"Interpolation","expression":{"content":"name","is_static":false,"is_for_key":false,"loc":{"start":{"line":0,"col":0,"offset":0},"end":{"line":0,"col":0,"offset":0}}},"is_static":false,"loc":{"start":{"line":0,"col":0,"offset":0},"end":{"line":0,"col":0,"offset":0}}}
			],
			"self_closing":false,"is_static":false,"hoisted":false,
			"loc":{"start":{"line":0,"col":0,"offset":0},"end":{"line":0,"col":0,"offset":0}}
		}],
		"hoisted":[],
		"loc":{"start":{"line":0,"col":0,"offset":0},"end":{"line":0,"col":0,"offset":0}}
	}`

	node, err := rustast.ParseAST([]byte(astJSON))
	if err != nil {
		t.Fatalf("ParseAST: %v", err)
	}
	got, err := engine.Render(node, evalexpr.Scope{"name": "World"})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if !strings.HasPrefix(got, "<p>Hello ") {
		t.Errorf("expected '<p>Hello ...', got %q", got)
	}
	if !strings.Contains(got, "World") {
		t.Errorf("expected 'World', got %q", got)
	}
	if !strings.HasSuffix(got, "</p>") {
		t.Errorf("expected to end with '</p>', got %q", got)
	}
}

// ─── middleware coupling test (SKILLS.md §3, bug #2) ─────────────────────────

// TestMiddlewareWiresRegistry verifies that the Middleware function attaches
// BOTH the RequestContext AND the reactive Registry to the request context.
// This is the exact pattern §3 (bug #2) warns about: a per-request store
// added without being wired at the same call-site as everything else.
func TestMiddlewareWiresRegistry(t *testing.T) {
	var gotRC *engine.RequestContext
	var gotReg *engine.Registry

	inner := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotRC = engine.From(r.Context())
		gotReg = engine.RegistryFrom(r.Context())
	})
	wrapped := engine.Middleware(inner)

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	rr := httptest.NewRecorder()
	wrapped.ServeHTTP(rr, req)

	if gotRC == nil {
		t.Error("Middleware did not attach RequestContext to context")
	}
	if gotReg == nil {
		t.Error("Middleware did not attach Registry to context")
	}
}

// TestSignalScopeIsolation verifies that WithScope + NewSignal are
// properly isolated per scope (no cross-contamination between scopes).
func TestSignalScopeIsolation(t *testing.T) {
	reg := engine.NewRegistry()
	ctx := engine.WithRegistry(context.Background(), reg)

	var sig1, sig2 *engine.Signal[int]

	engine.WithScope(ctx, "scope-A", func(ctx context.Context) {
		sig1 = engine.NewSignal(ctx, 10)
	})
	engine.WithScope(ctx, "scope-B", func(ctx context.Context) {
		sig2 = engine.NewSignal(ctx, 20)
	})

	if sig1.Get() != 10 {
		t.Errorf("scope-A signal: got %d, want 10", sig1.Get())
	}
	if sig2.Get() != 20 {
		t.Errorf("scope-B signal: got %d, want 20", sig2.Get())
	}

	snap := reg.Snapshot()
	if len(snap["scope-A"]) != 1 || snap["scope-A"][0] != 10 {
		t.Errorf("registry scope-A: %v", snap["scope-A"])
	}
	if len(snap["scope-B"]) != 1 || snap["scope-B"][0] != 20 {
		t.Errorf("registry scope-B: %v", snap["scope-B"])
	}
}

// TestHydrationScript verifies the dehydration script format expected by the client.
func TestHydrationScript(t *testing.T) {
	script, err := engine.RenderDehydrationScript(
		map[string]map[string]any{"resource/key": {"data": "val"}},
		map[string][]any{"scope-A": {42}},
	)
	if err != nil {
		t.Fatalf("RenderDehydrationScript: %v", err)
	}
	if !strings.Contains(script, `window.__FUSEE_STATE__`) {
		t.Errorf("expected window.__FUSEE_STATE__ in script, got %q", script)
	}
	if !strings.Contains(script, `scope-A`) {
		t.Errorf("expected scope data in script, got %q", script)
	}
}
