package evalexpr_test

import (
	"math"
	"testing"

	"fusee/evalexpr"
)

func TestEvalLiterals(t *testing.T) {
	scope := evalexpr.Scope{}
	cases := []struct {
		expr string
		want any
	}{
		{"true", true},
		{"false", false},
		{"null", nil},
		{"undefined", nil},
		{"42", float64(42)},
		{"3.14", float64(3.14)},
		{`"hello"`, "hello"},
		{`'world'`, "world"},
	}
	for _, c := range cases {
		got, err := evalexpr.Eval(c.expr, scope)
		if err != nil {
			t.Errorf("Eval(%q): unexpected error: %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("Eval(%q) = %v (%T), want %v (%T)", c.expr, got, got, c.want, c.want)
		}
	}
}

func TestEvalScope(t *testing.T) {
	scope := evalexpr.Scope{
		"name":  "Alice",
		"count": float64(5),
		"ok":    true,
	}
	cases := []struct {
		expr string
		want any
	}{
		{"name", "Alice"},
		{"count", float64(5)},
		{"ok", true},
		{"missing", nil},
	}
	for _, c := range cases {
		got, err := evalexpr.Eval(c.expr, scope)
		if err != nil {
			t.Errorf("Eval(%q): unexpected error: %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("Eval(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalArithmetic(t *testing.T) {
	scope := evalexpr.Scope{"x": float64(10), "y": float64(3)}
	cases := []struct {
		expr string
		want float64
	}{
		{"x + y", 13},
		{"x - y", 7},
		{"x * y", 30},
		{"x / y", 10.0 / 3.0},
		{"x % y", 1},
		{"-x", -10},
	}
	for _, c := range cases {
		got, err := evalexpr.Eval(c.expr, scope)
		if err != nil {
			t.Errorf("Eval(%q): %v", c.expr, err)
			continue
		}
		n, ok := got.(float64)
		if !ok {
			t.Errorf("Eval(%q) = %v (%T), want float64", c.expr, got, got)
			continue
		}
		if math.Abs(n-c.want) > 1e-9 {
			t.Errorf("Eval(%q) = %v, want %v", c.expr, n, c.want)
		}
	}
}

func TestEvalComparison(t *testing.T) {
	scope := evalexpr.Scope{"a": float64(5), "b": float64(10)}
	cases := []struct {
		expr string
		want bool
	}{
		{"a == 5", true},
		{"a != b", true},
		{"a < b", true},
		{"a > b", false},
		{"a <= 5", true},
		{"b >= 10", true},
		{"a === 5", true},
	}
	for _, c := range cases {
		got, err := evalexpr.EvalBool(c.expr, scope)
		if err != nil {
			t.Errorf("EvalBool(%q): %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("EvalBool(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalLogical(t *testing.T) {
	scope := evalexpr.Scope{"t": true, "f": false, "zero": float64(0), "one": float64(1)}
	cases := []struct {
		expr string
		want bool
	}{
		{"t && one", true},
		{"f && one", false},
		{"f || t", true},
		{"f || f", false},
		{"!t", false},
		{"!f", true},
	}
	for _, c := range cases {
		got, err := evalexpr.EvalBool(c.expr, scope)
		if err != nil {
			t.Errorf("EvalBool(%q): %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("EvalBool(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalTernary(t *testing.T) {
	scope := evalexpr.Scope{"ok": true, "x": float64(1)}
	cases := []struct {
		expr string
		want any
	}{
		{"ok ? 'yes' : 'no'", "yes"},
		{"false ? 'yes' : 'no'", "no"},
		{"x > 0 ? 'positive' : 'zero'", "positive"},
	}
	for _, c := range cases {
		got, err := evalexpr.Eval(c.expr, scope)
		if err != nil {
			t.Errorf("Eval(%q): %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("Eval(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalMemberAccess(t *testing.T) {
	scope := evalexpr.Scope{
		"user": map[string]any{
			"name": "Bob",
			"age":  float64(30),
		},
		"items": []any{"a", "b", "c"},
	}
	cases := []struct {
		expr string
		want any
	}{
		{"user.name", "Bob"},
		{"user.age", float64(30)},
		{"items[0]", "a"},
		{"items[2]", "c"},
		{"items.length", float64(3)},
	}
	for _, c := range cases {
		got, err := evalexpr.Eval(c.expr, scope)
		if err != nil {
			t.Errorf("Eval(%q): %v", c.expr, err)
			continue
		}
		if got != c.want {
			t.Errorf("Eval(%q) = %v, want %v", c.expr, got, c.want)
		}
	}
}

func TestEvalStringConcat(t *testing.T) {
	scope := evalexpr.Scope{"first": "Hello", "last": "World"}
	got, err := evalexpr.Eval(`first + " " + last`, scope)
	if err != nil {
		t.Fatalf("Eval: %v", err)
	}
	if got != "Hello World" {
		t.Errorf("got %q, want %q", got, "Hello World")
	}
}

func TestEvalNullCoalesce(t *testing.T) {
	scope := evalexpr.Scope{"x": nil, "y": "fallback"}
	got, err := evalexpr.Eval("x ?? y", scope)
	if err != nil {
		t.Fatalf("Eval: %v", err)
	}
	if got != "fallback" {
		t.Errorf("got %v, want %q", got, "fallback")
	}
}
