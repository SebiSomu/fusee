package engine

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
)

type ActionFunc func(args []any) (any, error)
type StatusError struct {
	Status  int
	Message string
	Code    string
}

func (e *StatusError) Error() string { return e.Message }

type ActionRegistry struct {
	mu      sync.RWMutex
	actions map[string]ActionFunc
}

func NewActionRegistry() *ActionRegistry {
	return &ActionRegistry{actions: make(map[string]ActionFunc)}
}

func (r *ActionRegistry) DefineAction(name string, fn ActionFunc) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.actions[name] = fn
}

func (r *ActionRegistry) lookup(name string) (ActionFunc, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	fn, ok := r.actions[name]
	return fn, ok
}

func (r *ActionRegistry) RegisteredNames() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	names := make([]string, 0, len(r.actions))
	for name := range r.actions {
		names = append(names, name)
	}
	return names
}

type requestBody struct {
	Args []any `json:"args"`
}

type responseBody struct {
	Data  any    `json:"data,omitempty"`
	Error string `json:"error,omitempty"`
	Code  string `json:"code,omitempty"`
}

func (r *ActionRegistry) HandleRequest(w http.ResponseWriter, req *http.Request, name string) {
	fn, ok := r.lookup(name)
	if !ok {
		sendJSON(w, http.StatusNotFound, responseBody{Error: fmt.Sprintf("Action %q not found", name)})
		return
	}

	raw, err := io.ReadAll(req.Body)
	if err != nil {
		sendJSON(w, http.StatusBadRequest, responseBody{Error: "Invalid request body"})
		return
	}

	var body requestBody
	if len(raw) > 0 {
		if err := json.Unmarshal(raw, &body); err != nil {
			sendJSON(w, http.StatusBadRequest, responseBody{Error: "Invalid JSON body"})
			return
		}
	}

	data, err := fn(body.Args)
	if err != nil {
		var se *StatusError
		if ok := asStatusError(err, &se); ok {
			sendJSON(w, se.Status, responseBody{Error: se.Message, Code: se.Code})
			return
		}

		fmt.Printf("[fusee] action %q returned an error: %v\n", name, err)
		sendJSON(w, http.StatusInternalServerError, responseBody{Error: "Internal server error"})
		return
	}

	sendJSON(w, http.StatusOK, responseBody{Data: data})
}

func asStatusError(err error, target **StatusError) bool {
	if se, ok := err.(*StatusError); ok {
		*target = se
		return true
	}
	return false
}

func sendJSON(w http.ResponseWriter, status int, body responseBody) {
	raw, err := json.Marshal(body)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	w.Write(raw)
}
