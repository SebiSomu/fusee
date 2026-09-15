package engine

import (
	"fmt"
	"net/http"
)

type boundary struct {
	id       string
	resultCh chan string
}

type BoundaryRegistry struct {
	boundaries []*boundary
}

func NewBoundaryRegistry() *BoundaryRegistry {
	return &BoundaryRegistry{}
}

func (b *BoundaryRegistry) RegisterBoundary(id, fallback string, work func() string) string {
	bd := &boundary{id: id, resultCh: make(chan string, 1)}
	b.boundaries = append(b.boundaries, bd)

	go func() {
		bd.resultCh <- work()
	}()

	return fmt.Sprintf(`<div id="%s" data-f-boundary>%s</div>`, id, fallback)
}

func renderBoundaryChunk(id, html string) string {
	tplID := "tpl-" + id
	return fmt.Sprintf(
		`<template id="%s">%s</template><script>(function(){var t=document.getElementById(%q);var d=document.getElementById(%q);if(t&&d&&d.parentNode){d.replaceWith(t.content);t.remove();}var s=document.currentScript;if(s&&s.parentNode)s.parentNode.removeChild(s);})();</script>`,
		tplID, html, tplID, id,
	)
}

func RenderPageToStream(w http.ResponseWriter, headers http.Header, shell func(*BoundaryRegistry) string, tail func() string) error {
	for k, vs := range headers {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		return fmt.Errorf("ssr: ResponseWriter does not support flushing (http.Flusher)")
	}

	registry := NewBoundaryRegistry()
	shellHTML := shell(registry)

	if _, err := w.Write([]byte(shellHTML)); err != nil {
		return err
	}
	flusher.Flush()

	if err := flushBoundariesOutOfOrder(w, flusher, registry.boundaries); err != nil {
		return err
	}

	if tail != nil {
		if _, err := w.Write([]byte(tail())); err != nil {
			return err
		}
		flusher.Flush()
	}

	return nil
}

func flushBoundariesOutOfOrder(w http.ResponseWriter, flusher http.Flusher, boundaries []*boundary) error {
	if len(boundaries) == 0 {
		return nil
	}

	type result struct {
		id   string
		html string
	}
	done := make(chan result, len(boundaries))

	for _, b := range boundaries {
		b := b
		go func() {
			html := <-b.resultCh
			done <- result{id: b.id, html: html}
		}()
	}

	for i := 0; i < len(boundaries); i++ {
		r := <-done
		if _, err := w.Write([]byte(renderBoundaryChunk(r.id, r.html))); err != nil {
			return err
		}
		flusher.Flush()
	}

	return nil
}
