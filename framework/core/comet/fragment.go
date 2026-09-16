package comet

import (
	"net/http"

	"../dispatcher"
	"../router"
)

func FragmentAware(fragment, fullPage dispatcher.RenderFunc) dispatcher.RenderFunc {
	return func(w http.ResponseWriter, r *http.Request, route *router.Route, params map[string]string, data any) {
		if IsComet(r) {
			fragment(w, r, route, params, data)
			return
		}
		fullPage(w, r, route, params, data)
	}
}
