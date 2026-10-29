package engine_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	engine "fusee"
)

// pageHandler mirrors cmd/server's handler: a Module embedded next to page data.
type pageHandler struct {
	engine.Module
	Title string
}

func TestDispatcherCallsLoadOnHandlersEmbeddingModule(t *testing.T) {
	handler := &pageHandler{
		Module: engine.Module{Load: func(map[string]string, map[string][]string, *http.Request) (any, error) {
			return map[string]any{"title": "loaded"}, nil
		}},
		Title: "page",
	}

	var gotData any
	var gotHandler any
	dispatcher := engine.NewDispatcher(engine.Config{
		Routes: []*engine.Route{engine.Compile("/", handler)},
		Render: func(w http.ResponseWriter, r *http.Request, route *engine.Route, params map[string]string, data any) {
			gotData, gotHandler = data, route.Handler
		},
	})

	dispatcher.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, "/", nil))

	if m, ok := gotData.(map[string]any); !ok || m["title"] != "loaded" {
		t.Fatalf("Load data not passed to Render, got %#v", gotData)
	}
	if gotHandler != handler {
		t.Fatalf("Render should receive the original handler")
	}
}
