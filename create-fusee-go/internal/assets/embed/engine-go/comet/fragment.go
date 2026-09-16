package comet

import (
	"context"
	"net/http"

	engine "fusee"
)

// FragmentAware wraps a fragment renderer and a full page renderer, dispatching to
// the fragment renderer when Comet-Request header is detected, or fullPage otherwise.
func FragmentAware(fragment, fullPage engine.RenderFunc) engine.RenderFunc {
	return func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		if IsComet(r) {
			fragment(w, r, route, params, data)
			return
		}
		fullPage(w, r, route, params, data)
	}
}

// RenderFragment writes a standalone HTML fragment response with text/html content type.
func RenderFragment(w http.ResponseWriter, html string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(html))
}

// RenderFragmentWithState writes an HTML fragment accompanied by an embedded Fusée hydration state script.
func RenderFragmentWithState(w http.ResponseWriter, html string, resources map[string]map[string]any, signals map[string][]any) error {
	script, err := engine.RenderDehydrationScript(resources, signals)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, err = w.Write([]byte(html + "\n" + script))
	return err
}

// RenderFragmentWithContext writes an HTML fragment with hydration state extracted from the request Context.
func RenderFragmentWithContext(w http.ResponseWriter, ctx context.Context, html string) error {
	script, err := engine.BuildFromContext(ctx)
	if err != nil {
		return err
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, err = w.Write([]byte(html + "\n" + script))
	return err
}
