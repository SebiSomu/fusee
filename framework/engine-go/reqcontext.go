package reqcontext

import (
	"context"
	"net/http"
	"sync"
)

type contextKey struct{}

type RequestContext struct {
	mu             sync.Mutex
	ResourceCache  map[string]map[string]any
	SignalRegistry map[string][]any
}

func New() *RequestContext {
	return &RequestContext{
		ResourceCache:  make(map[string]map[string]any),
		SignalRegistry: make(map[string][]any),
	}
}

func (rc *RequestContext) SetResource(resourceKey, cacheKey string, value any) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	m, ok := rc.ResourceCache[resourceKey]
	if !ok {
		m = make(map[string]any)
		rc.ResourceCache[resourceKey] = m
	}
	m[cacheKey] = value
}

func With(ctx context.Context, rc *RequestContext) context.Context {
	return context.WithValue(ctx, contextKey{}, rc)
}

func From(ctx context.Context) *RequestContext {
	rc, _ := ctx.Value(contextKey{}).(*RequestContext)
	return rc
}

func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rc := New()
		ctx := With(r.Context(), rc)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
