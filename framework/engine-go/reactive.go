package reactive

import (
	"context"
	"encoding/json"
	"sync"
)

type registryKey struct{}
type frameKey struct{}
type frame struct {
	scopeID string
	index   int
}
type Registry struct {
	mu   sync.Mutex
	data map[string][]any
}

func NewRegistry() *Registry {
	return &Registry{data: make(map[string][]any)}
}

func WithRegistry(ctx context.Context, reg *Registry) context.Context {
	return context.WithValue(ctx, registryKey{}, reg)
}

func registryFrom(ctx context.Context) *Registry {
	reg, _ := ctx.Value(registryKey{}).(*Registry)
	return reg
}
func (r *Registry) Snapshot() map[string][]any {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make(map[string][]any, len(r.data))
	for k, v := range r.data {
		cp := make([]any, len(v))
		copy(cp, v)
		out[k] = cp
	}
	return out
}

func (r *Registry) Load(snapshot map[string][]any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for k, v := range snapshot {
		r.data[k] = v
	}
}

func WithScope(ctx context.Context, scopeID string, fn func(ctx context.Context)) {
	f := &frame{scopeID: scopeID, index: 0}
	fn(context.WithValue(ctx, frameKey{}, f))
}

func currentFrame(ctx context.Context) *frame {
	f, _ := ctx.Value(frameKey{}).(*frame)
	return f
}

type Signal[T any] struct {
	mu    sync.Mutex
	value T
}

func (s *Signal[T]) Get() T {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.value
}

func (s *Signal[T]) Set(v T) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.value = v
}

func NewSignal[T any](ctx context.Context, initial T) *Signal[T] {
	f := currentFrame(ctx)
	if f == nil {
		return &Signal[T]{value: initial}
	}
	reg := registryFrom(ctx)
	if reg == nil {
		return &Signal[T]{value: initial}
	}

	reg.mu.Lock()
	defer reg.mu.Unlock()

	idx := f.index
	f.index++

	list := reg.data[f.scopeID]
	if idx < len(list) && list[idx] != nil {
		var hydrated T
		if err := reDecode(list[idx], &hydrated); err == nil {
			return &Signal[T]{value: hydrated}
		}
	}

	for len(list) <= idx {
		list = append(list, nil)
	}
	list[idx] = initial
	reg.data[f.scopeID] = list

	return &Signal[T]{value: initial}
}

func reDecode(v any, out any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	return json.Unmarshal(b, out)
}
