package comet

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	engine "fusee"
)

func TestIsComet(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	if IsComet(r) {
		t.Fatal("expected false with no header")
	}

	r.Header.Set("Comet-Request", "true")
	if !IsComet(r) {
		t.Fatal("expected true with Comet-Request: true")
	}

	r.Header.Set("Comet-Request", "false")
	if IsComet(r) {
		t.Fatal("expected false with Comet-Request: false")
	}
}

func TestIsComet_CaseInsensitiveHeaderLookup(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("comet-request", "true")
	if !IsComet(r) {
		t.Fatal("expected header lookup to be case-insensitive")
	}
}

func TestGetCometTarget(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	if GetCometTarget(r) != "" {
		t.Fatal("expected empty string when header absent")
	}
	r.Header.Set("Comet-Target", "#out")
	if GetCometTarget(r) != "#out" {
		t.Fatalf("got %q", GetCometTarget(r))
	}
}

func TestGetCometTrigger(t *testing.T) {
	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Comet-Trigger", "click")
	if GetCometTrigger(r) != "click" {
		t.Fatalf("got %q", GetCometTrigger(r))
	}
}

func TestRetarget_SetsHeader(t *testing.T) {
	w := httptest.NewRecorder()
	Retarget(w, "#alt")
	if w.Header().Get("Comet-Retarget") != "#alt" {
		t.Fatalf("got %q", w.Header().Get("Comet-Retarget"))
	}
}

func TestReswap_SetsHeader(t *testing.T) {
	w := httptest.NewRecorder()
	Reswap(w, "outerHTML")
	if w.Header().Get("Comet-Reswap") != "outerHTML" {
		t.Fatalf("got %q", w.Header().Get("Comet-Reswap"))
	}
}

func TestPushURL_SetsHeader(t *testing.T) {
	w := httptest.NewRecorder()
	PushURL(w, "/new")
	if w.Header().Get("Comet-Push-Url") != "/new" {
		t.Fatalf("got %q", w.Header().Get("Comet-Push-Url"))
	}
}

func TestRedirect_SetsHeaderWithoutForcingAStatusCode(t *testing.T) {
	w := httptest.NewRecorder()
	Redirect(w, "/elsewhere")
	if w.Header().Get("Comet-Redirect") != "/elsewhere" {
		t.Fatalf("got %q", w.Header().Get("Comet-Redirect"))
	}
	if w.Code != http.StatusOK {
		t.Fatalf("Redirect() must not set a redirect status itself, got %d", w.Code)
	}
}

func TestRedirect_ComposesWithA2xxStatusSetByTheCaller(t *testing.T) {
	w := httptest.NewRecorder()
	Redirect(w, "/elsewhere")
	w.WriteHeader(http.StatusOK)
	w.Write([]byte(""))

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Comet-Redirect") != "/elsewhere" {
		t.Fatal("header should survive alongside an explicit 200 status")
	}
}

func TestFragmentAware_RoutesToFragmentForACometRequest(t *testing.T) {
	var called string
	fragment := func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		called = "fragment"
		w.WriteHeader(http.StatusOK)
	}
	fullPage := func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		called = "fullPage"
		w.WriteHeader(http.StatusOK)
	}

	renderFn := FragmentAware(fragment, fullPage)

	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	r.Header.Set("Comet-Request", "true")
	w := httptest.NewRecorder()
	renderFn(w, r, nil, nil, nil)

	if called != "fragment" {
		t.Fatalf("expected fragment to be called, got %q", called)
	}
}

func TestFragmentAware_RoutesToFullPageForADirectVisit(t *testing.T) {
	var called string
	fragment := func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		called = "fragment"
	}
	fullPage := func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		called = "fullPage"
	}

	renderFn := FragmentAware(fragment, fullPage)

	r := httptest.NewRequest(http.MethodGet, "/x", nil)
	w := httptest.NewRecorder()
	renderFn(w, r, nil, nil, nil)

	if called != "fullPage" {
		t.Fatalf("expected fullPage to be called, got %q", called)
	}
}

func TestFragmentAware_IntegratesWithARealDispatcher(t *testing.T) {
	module := &engine.Module{
		Load: func(params map[string]string, query map[string][]string, r *http.Request) (any, error) {
			return "loaded-data", nil
		},
	}

	var gotComet bool
	renderFn := FragmentAware(
		func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
			gotComet = true
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("fragment:" + data.(string)))
		},
		func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
			gotComet = false
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("<html>full:" + data.(string) + "</html>"))
		},
	)

	d := engine.NewDispatcher(engine.Config{
		Routes: []*engine.Route{engine.Compile("/page", module)},
		Render: renderFn,
	})

	// Comet (fragment) request
	w1 := httptest.NewRecorder()
	r1 := httptest.NewRequest(http.MethodGet, "/page", nil)
	r1.Header.Set("Comet-Request", "true")
	d.ServeHTTP(w1, r1)
	if !gotComet {
		t.Fatal("expected the fragment path for a Comet request")
	}
	if w1.Body.String() != "fragment:loaded-data" {
		t.Fatalf("got %q", w1.Body.String())
	}

	// Direct browser visit
	w2 := httptest.NewRecorder()
	r2 := httptest.NewRequest(http.MethodGet, "/page", nil)
	d.ServeHTTP(w2, r2)
	if gotComet {
		t.Fatal("expected the full-page path for a direct visit")
	}
	if w2.Body.String() != "<html>full:loaded-data</html>" {
		t.Fatalf("got %q", w2.Body.String())
	}
}

func TestRenderFragment_WritesHTML(t *testing.T) {
	w := httptest.NewRecorder()
	RenderFragment(w, "<div>fragment</div>")

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Content-Type") != "text/html; charset=utf-8" {
		t.Fatalf("expected text/html header, got %q", w.Header().Get("Content-Type"))
	}
	if w.Body.String() != "<div>fragment</div>" {
		t.Fatalf("got %q", w.Body.String())
	}
}

func TestRenderFragmentWithState_EmbedsHydrationScript(t *testing.T) {
	w := httptest.NewRecorder()
	resources := map[string]map[string]any{
		"users": {"1": map[string]any{"data": "Alice"}},
	}
	signals := map[string][]any{
		"count": {10},
	}

	err := RenderFragmentWithState(w, "<div id=\"frag\">Hello</div>", resources, signals)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	body := w.Body.String()
	if !strings.Contains(body, `<div id="frag">Hello</div>`) {
		t.Fatalf("missing fragment HTML in body: %q", body)
	}
	if !strings.Contains(body, `<script id="__FUSEE_DATA__">window.__FUSEE_STATE__ =`) {
		t.Fatalf("missing state script in body: %q", body)
	}
	if !strings.Contains(body, `"Alice"`) || !strings.Contains(body, `10`) {
		t.Fatalf("missing resource/signal data in body: %q", body)
	}
}

