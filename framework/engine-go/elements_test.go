package engine_test

import (
	"regexp"
	"strings"
	"testing"

	engine "fusee"
	"fusee/evalexpr"
	"fusee/rustast"
)

// The fixture manifest is generated from testdata/elements-app by the JS manifest
// generator; framework/__tests__/manifest-elements.test.js fails when it is stale.
const elementsManifest = "testdata/elements-app/manifest.json"

var anchorNoise = regexp.MustCompile(`<!--/?f-[^>]*-->| data-f-id="\d+"`)

// stripAnchors removes hydration comments and anchor ids so assertions read like markup.
func stripAnchors(html string) string {
	return anchorNoise.ReplaceAllString(html, "")
}

func loadElementsManifest(t *testing.T) *engine.Manifest {
	t.Helper()
	m, err := engine.LoadManifest(elementsManifest)
	if err != nil {
		t.Fatalf("LoadManifest: %v", err)
	}
	return m
}

func routeAST(t *testing.T, m *engine.Manifest, pattern string) *rustast.Node {
	t.Helper()
	for _, r := range m.Routes {
		if r.Pattern == pattern {
			return r.AST
		}
	}
	t.Fatalf("route %s not in manifest", pattern)
	return nil
}

// renderIndex renders the fixture's index page with a Go Setup attached to <fu-greet>.
func renderIndex(t *testing.T) string {
	t.Helper()
	m := loadElementsManifest(t)
	elements := m.ElementRegistry()
	elements["fu-greet"].Setup = func(props evalexpr.Scope) (evalexpr.Scope, error) {
		return evalexpr.Scope{"greeting": "Hello, " + props["name"].(string) + "!"}, nil
	}

	scope := evalexpr.Scope{"title": "Live", "items": []any{"a", "b"}}
	html, err := engine.RenderWithElements(routeAST(t, m, "/"), scope, nil, elements)
	if err != nil {
		t.Fatalf("RenderWithElements: %v", err)
	}
	return stripAnchors(html)
}

func assertContains(t *testing.T, html, want string) {
	t.Helper()
	if !strings.Contains(html, want) {
		t.Errorf("missing %q in:\n%s", want, html)
	}
}

func TestManifestLoadsElements(t *testing.T) {
	m := loadElementsManifest(t)
	reg := m.ElementRegistry()

	for _, tag := range []string{"fu-card", "fu-badge", "fu-shell", "fu-greet", "fu-loop"} {
		if reg[tag] == nil {
			t.Errorf("element %s missing from registry", tag)
		}
	}
	if reg["fu-light"] != nil {
		t.Errorf("light-DOM element should not be in the manifest")
	}
}

func TestElementRendersDeclarativeShadowDOM(t *testing.T) {
	html := renderIndex(t)

	assertContains(t, html,
		`<fu-card items="[&quot;a&quot;,&quot;b&quot;]" title="Live" count="2">`+
			`<template shadowrootmode="open"><style>:host { display: block }</style>`+
			`<h2>Live</h2><ul><li>a</li><li>b</li></ul><p>open:2</p>`+
			`<slot name="foot"></slot><slot></slot></template>`+
			`<p slot="foot">footer</p></fu-card>`)
}

func TestElementConvertsStaticAttributesAndClosesSelfClosingTags(t *testing.T) {
	html := renderIndex(t)

	assertContains(t, html,
		`<fu-card title="Static" count="7" open=""><template shadowrootmode="open"><style>:host { display: block }</style>`+
			`<h2>Static</h2><ul></ul><p>open:7</p><slot name="foot"></slot><slot></slot></template></fu-card>`)
}

func TestElementRendersNestedAndClosedShadowRoots(t *testing.T) {
	html := renderIndex(t)

	assertContains(t, html,
		`<fu-shell><template shadowrootmode="open">`+
			`<fu-badge label="inner"><template shadowrootmode="closed" shadowrootdelegatesfocus><b>inner</b></template></fu-badge>`+
			`<slot></slot></template>`+
			`<fu-badge label="slotted"><template shadowrootmode="closed" shadowrootdelegatesfocus><b>slotted</b></template></fu-badge>`+
			`</fu-shell>`)
}

func TestElementUsesGoSetupForTemplateScope(t *testing.T) {
	assertContains(t, renderIndex(t), `<fu-greet name="Ada"><template shadowrootmode="open"><p>Hello, Ada!</p></template></fu-greet>`)
}

func TestUnregisteredCustomElementsGetJSONButNoShadowRoot(t *testing.T) {
	assertContains(t, renderIndex(t), `<x-unknown data="[&quot;a&quot;,&quot;b&quot;]"></x-unknown>`)
}

func TestRenderWithoutElementsKeepsPlainTags(t *testing.T) {
	m := loadElementsManifest(t)

	html, err := engine.Render(routeAST(t, m, "/"), evalexpr.Scope{"title": "Live", "items": []any{"a"}})
	if err != nil {
		t.Fatalf("Render: %v", err)
	}
	if strings.Contains(html, "shadowrootmode") {
		t.Errorf("Render without a registry must not add shadow roots:\n%s", html)
	}
}

func TestSelfRenderingElementFails(t *testing.T) {
	m := loadElementsManifest(t)

	_, err := engine.RenderWithElements(routeAST(t, m, "/loop"), evalexpr.Scope{}, nil, m.ElementRegistry())
	if err == nil || !strings.Contains(err.Error(), "nested deeper") {
		t.Fatalf("expected a nesting error, got %v", err)
	}
}
