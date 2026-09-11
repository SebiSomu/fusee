package engine

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

const defaultActionsBasePath = "/__fusee/actions"

type LoadFunc func(params map[string]string, query map[string][]string, r *http.Request) (any, error)

type RenderFunc func(w http.ResponseWriter, r *http.Request, route *Route, params map[string]string, data any)

type Module struct {
	Load LoadFunc
}

type Config struct {
	DistDir         string
	Routes          []*Route
	Actions         *Registry // Directly references Registry from actions.go
	Render          RenderFunc
	ActionsBasePath string
}

type Dispatcher struct {
	cfg Config
}

func NewDispatcher(cfg Config) *Dispatcher {
	if cfg.ActionsBasePath == "" {
		cfg.ActionsBasePath = defaultActionsBasePath
	}
	return &Dispatcher{cfg: cfg}
}

func (d *Dispatcher) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	// 1. Static asset bypass
	if d.cfg.DistDir != "" && (r.Method == http.MethodGet || r.Method == http.MethodHead) {
		if path, ok := Resolve(d.cfg.DistDir, r.URL.Path); ok {
			if err := Serve(w, r, path); err != nil {
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
			return
		}
	}

	// 2. Server Actions interceptor
	if r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, d.cfg.ActionsBasePath) {
		if d.cfg.Actions == nil {
			http.Error(w, "Not Found", http.StatusNotFound)
			return
		}
		name := strings.TrimPrefix(strings.TrimPrefix(r.URL.Path, d.cfg.ActionsBasePath), "/")
		d.cfg.Actions.HandleRequest(w, r, name) // Works directly via Registry
		return
	}

	// 3. Route matcher + data loader
	match := MatchAll(d.cfg.Routes, r.URL.Path)
	if match == nil {
		http.Error(w, "Not Found", http.StatusNotFound)
		return
	}

	var data any
	if module, ok := match.Route.Handler.(*Module); ok && module.Load != nil {
		var err error
		data, err = module.Load(match.Params, r.URL.Query(), r)
		if err != nil {
			d.handleLoadError(w, r, match.Route, err)
			return
		}
	}

	if d.cfg.Render == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]any{"params": match.Params, "data": data})
		return
	}

	d.cfg.Render(w, r, match.Route, match.Params, data)
}

func (d *Dispatcher) handleLoadError(w http.ResponseWriter, r *http.Request, route *Route, err error) {
	var redirect *RouteRedirect
	if errors.As(err, &redirect) {
		w.Header().Set("Location", redirect.Location)
		w.WriteHeader(redirect.Status)
		return
	}

	var httpErr *RouteHTTPError
	if errors.As(err, &httpErr) {
		http.Error(w, httpErr.Message, httpErr.Status)
		return
	}

	http.Error(w, "Internal Server Error", http.StatusInternalServerError)
}
