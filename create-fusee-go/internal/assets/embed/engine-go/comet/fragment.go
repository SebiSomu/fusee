package comet

import (
	"net/http"

	engine "fusee"
)

func FragmentAware(fragment, fullPage engine.RenderFunc) engine.RenderFunc {
	return func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
		if IsComet(r) {
			fragment(w, r, route, params, data)
			return
		}
		fullPage(w, r, route, params, data)
	}
}
