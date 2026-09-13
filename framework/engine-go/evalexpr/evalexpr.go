// Package evalexpr provides a small, safe expression interpreter for Fusée
// template expressions. It handles:
//   - Identifiers and member access (a.b.c)
//   - Index access (a[0], a["key"])
//   - Arithmetic: +, -, *, /, %
//   - Comparison: ==, !=, <, <=, >, >=
//   - Logical: &&, ||, !
//   - String concatenation via +
//   - Ternary: cond ? a : b
//   - Null-coalescing: a ?? b
//
// No code-execution path exists here — this is intentionally safer than
// JS's new Function() approach, since Go has no eval capability anyway.
package evalexpr

import (
	"fmt"
	"math"
	"strconv"
	"strings"
	"unicode"
)

// Scope is the data context passed to Eval. Keys are variable names.
type Scope map[string]any

// Eval evaluates a template expression string against the given scope.
// It returns the computed value (string, float64, bool, []any, map[string]any, nil).
func Eval(expr string, scope Scope) (any, error) {
	expr = strings.TrimSpace(expr)
	if expr == "" {
		return nil, nil
	}
	p := &parser{input: expr, scope: scope}
	v, err := p.parseTernary()
	if err != nil {
		return nil, fmt.Errorf("evalexpr: %w (in %q)", err, expr)
	}
	return v, nil
}

// EvalBool evaluates an expression and coerces the result to bool.
func EvalBool(expr string, scope Scope) (bool, error) {
	v, err := Eval(expr, scope)
	if err != nil {
		return false, err
	}
	return truthy(v), nil
}

// ─── parser ──────────────────────────────────────────────────────────────────

type parser struct {
	input string
	pos   int
	scope Scope
}

func (p *parser) peek() byte {
	p.skipWS()
	if p.pos >= len(p.input) {
		return 0
	}
	return p.input[p.pos]
}

func (p *parser) skipWS() {
	for p.pos < len(p.input) && isWS(p.input[p.pos]) {
		p.pos++
	}
}

func (p *parser) consume(n int) {
	p.pos += n
}

func (p *parser) peekStr(s string) bool {
	p.skipWS()
	return strings.HasPrefix(p.input[p.pos:], s)
}

func (p *parser) consumeStr(s string) bool {
	p.skipWS()
	if strings.HasPrefix(p.input[p.pos:], s) {
		p.pos += len(s)
		return true
	}
	return false
}

// ─── grammar (recursive-descent) ─────────────────────────────────────────────

// ternary: nullCoalesce ( '?' ternary ':' ternary )?
func (p *parser) parseTernary() (any, error) {
	cond, err := p.parseNullCoalesce()
	if err != nil {
		return nil, err
	}
	if !p.consumeStr("?") {
		return cond, nil
	}
	yes, err := p.parseTernary()
	if err != nil {
		return nil, err
	}
	if !p.consumeStr(":") {
		return nil, fmt.Errorf("expected ':' in ternary")
	}
	no, err := p.parseTernary()
	if err != nil {
		return nil, err
	}
	if truthy(cond) {
		return yes, nil
	}
	return no, nil
}

// nullCoalesce: or ( '??' or )*
func (p *parser) parseNullCoalesce() (any, error) {
	left, err := p.parseOr()
	if err != nil {
		return nil, err
	}
	for p.consumeStr("??") {
		right, err := p.parseOr()
		if err != nil {
			return nil, err
		}
		if left == nil {
			left = right
		}
	}
	return left, nil
}

// or: and ( '||' and )*
func (p *parser) parseOr() (any, error) {
	left, err := p.parseAnd()
	if err != nil {
		return nil, err
	}
	for p.consumeStr("||") {
		right, err := p.parseAnd()
		if err != nil {
			return nil, err
		}
		if !truthy(left) {
			left = right
		}

	}
	return left, nil
}

// and: equality ( '&&' equality )*
func (p *parser) parseAnd() (any, error) {
	left, err := p.parseEquality()
	if err != nil {
		return nil, err
	}
	for p.consumeStr("&&") {
		right, err := p.parseEquality()
		if err != nil {
			return nil, err
		}
		if !truthy(left) {
			// short-circuit
		} else {
			left = right
		}
	}
	return left, nil
}

// equality: comparison ( ('=='|'!='|'==='|'!==') comparison )*
func (p *parser) parseEquality() (any, error) {
	left, err := p.parseComparison()
	if err != nil {
		return nil, err
	}
	for {
		if p.consumeStr("===") || p.consumeStr("==") {
			right, err := p.parseComparison()
			if err != nil {
				return nil, err
			}
			left = looseEq(left, right)
		} else if p.consumeStr("!==") || p.consumeStr("!=") {
			right, err := p.parseComparison()
			if err != nil {
				return nil, err
			}
			left = !looseEq(left, right)
		} else {
			break
		}
	}
	return left, nil
}

// comparison: addition ( ('<='|'>='|'<'|'>') addition )*
func (p *parser) parseComparison() (any, error) {
	left, err := p.parseAddition()
	if err != nil {
		return nil, err
	}
	for {
		if p.consumeStr("<=") {
			right, err := p.parseAddition()
			if err != nil {
				return nil, err
			}
			left = compareOp(left, right) <= 0
		} else if p.consumeStr(">=") {
			right, err := p.parseAddition()
			if err != nil {
				return nil, err
			}
			left = compareOp(left, right) >= 0
		} else if p.peekByte('<') {
			p.consume(1)
			right, err := p.parseAddition()
			if err != nil {
				return nil, err
			}
			left = compareOp(left, right) < 0
		} else if p.peekByte('>') {
			p.consume(1)
			right, err := p.parseAddition()
			if err != nil {
				return nil, err
			}
			left = compareOp(left, right) > 0
		} else {
			break
		}
	}
	return left, nil
}

func (p *parser) peekByte(b byte) bool {
	p.skipWS()
	return p.pos < len(p.input) && p.input[p.pos] == b
}

// addition: multiplication ( ('+'|'-') multiplication )*
func (p *parser) parseAddition() (any, error) {
	left, err := p.parseMultiplication()
	if err != nil {
		return nil, err
	}
	for {
		if p.peekByte('+') {
			p.consume(1)
			right, err := p.parseMultiplication()
			if err != nil {
				return nil, err
			}
			left = addValues(left, right)
		} else if p.peekByte('-') {
			p.consume(1)
			right, err := p.parseMultiplication()
			if err != nil {
				return nil, err
			}
			left = numOp(left, right, func(a, b float64) float64 { return a - b })
		} else {
			break
		}
	}
	return left, nil
}

// multiplication: unary ( ('*'|'/'|'%') unary )*
func (p *parser) parseMultiplication() (any, error) {
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for {
		if p.peekByte('*') {
			p.consume(1)
			right, err := p.parseUnary()
			if err != nil {
				return nil, err
			}
			left = numOp(left, right, func(a, b float64) float64 { return a * b })
		} else if p.peekByte('/') {
			p.consume(1)
			right, err := p.parseUnary()
			if err != nil {
				return nil, err
			}
			left = numOp(left, right, func(a, b float64) float64 {
				if b == 0 {
					return math.NaN()
				}
				return a / b
			})
		} else if p.peekByte('%') {
			p.consume(1)
			right, err := p.parseUnary()
			if err != nil {
				return nil, err
			}
			left = numOp(left, right, func(a, b float64) float64 {
				if b == 0 {
					return math.NaN()
				}
				return math.Mod(a, b)
			})
		} else {
			break
		}
	}
	return left, nil
}

// unary: ('!'|'-')? postfix
func (p *parser) parseUnary() (any, error) {
	p.skipWS()
	if p.pos < len(p.input) && p.input[p.pos] == '!' {
		p.pos++
		v, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		return !truthy(v), nil
	}
	if p.pos < len(p.input) && p.input[p.pos] == '-' {
		p.pos++
		v, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		if n, ok := toNumber(v); ok {
			return -n, nil
		}
		return math.NaN(), nil
	}
	return p.parsePostfix()
}

// postfix: primary ( '.' ident | '[' expr ']' | '(' args ')' )*
func (p *parser) parsePostfix() (any, error) {
	val, err := p.parsePrimary()
	if err != nil {
		return nil, err
	}
	for {
		p.skipWS()
		if p.pos >= len(p.input) {
			break
		}
		ch := p.input[p.pos]
		if ch == '.' {
			p.pos++
			name, err := p.parseIdent()
			if err != nil {
				return nil, err
			}
			val = memberAccess(val, name)
		} else if ch == '[' {
			p.pos++
			key, err := p.parseTernary()
			if err != nil {
				return nil, err
			}
			p.skipWS()
			if p.pos < len(p.input) && p.input[p.pos] == ']' {
				p.pos++
			}
			val = indexAccess(val, key)
		} else {
			break
		}
	}
	return val, nil
}

// primary: literal | '(' expr ')' | ident
func (p *parser) parsePrimary() (any, error) {
	p.skipWS()
	if p.pos >= len(p.input) {
		return nil, fmt.Errorf("unexpected end of expression")
	}

	ch := p.input[p.pos]

	// Grouped
	if ch == '(' {
		p.pos++
		v, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		p.skipWS()
		if p.pos < len(p.input) && p.input[p.pos] == ')' {
			p.pos++
		}
		return v, nil
	}

	// String literals
	if ch == '\'' || ch == '"' || ch == '`' {
		return p.parseString(ch)
	}

	// Array literal
	if ch == '[' {
		return p.parseArray()
	}

	// Object literal
	if ch == '{' {
		return p.parseObject()
	}

	// Number
	if ch >= '0' && ch <= '9' {
		return p.parseNumber()
	}

	// Keyword / identifier
	if isIdentStart(ch) {
		return p.parseIdentOrKeyword()
	}

	return nil, fmt.Errorf("unexpected character %q", ch)
}

func (p *parser) parseString(quote byte) (any, error) {
	p.pos++ // skip opening quote
	var sb strings.Builder
	for p.pos < len(p.input) {
		c := p.input[p.pos]
		if c == quote {
			p.pos++
			return sb.String(), nil
		}
		if c == '\\' && p.pos+1 < len(p.input) {
			p.pos++
			switch p.input[p.pos] {
			case 'n':
				sb.WriteByte('\n')
			case 't':
				sb.WriteByte('\t')
			case 'r':
				sb.WriteByte('\r')
			default:
				sb.WriteByte(p.input[p.pos])
			}
			p.pos++
			continue
		}
		// Template literal interpolation (backtick): skip for now, treat as plain string
		sb.WriteByte(c)
		p.pos++
	}
	return sb.String(), nil
}

func (p *parser) parseNumber() (any, error) {
	start := p.pos
	for p.pos < len(p.input) && (p.input[p.pos] >= '0' && p.input[p.pos] <= '9' || p.input[p.pos] == '.' || p.input[p.pos] == 'e' || p.input[p.pos] == 'E' || p.input[p.pos] == '-' || p.input[p.pos] == '+') {
		p.pos++
	}
	n, err := strconv.ParseFloat(p.input[start:p.pos], 64)
	if err != nil {
		return nil, fmt.Errorf("invalid number %q", p.input[start:p.pos])
	}
	return n, nil
}

func (p *parser) parseArray() (any, error) {
	p.pos++ // skip '['
	var arr []any
	for {
		p.skipWS()
		if p.pos >= len(p.input) || p.input[p.pos] == ']' {
			break
		}
		v, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		arr = append(arr, v)
		p.skipWS()
		if p.pos < len(p.input) && p.input[p.pos] == ',' {
			p.pos++
		}
	}
	if p.pos < len(p.input) && p.input[p.pos] == ']' {
		p.pos++
	}
	return arr, nil
}

func (p *parser) parseObject() (any, error) {
	p.pos++ // skip '{'
	obj := map[string]any{}
	for {
		p.skipWS()
		if p.pos >= len(p.input) || p.input[p.pos] == '}' {
			break
		}
		// key: string or ident
		var key string
		ch := p.input[p.pos]
		if ch == '\'' || ch == '"' || ch == '`' {
			v, err := p.parseString(ch)
			if err != nil {
				return nil, err
			}
			key = fmt.Sprintf("%v", v)
		} else {
			k, err := p.parseIdent()
			if err != nil {
				return nil, err
			}
			key = k
		}
		p.skipWS()
		if p.pos < len(p.input) && p.input[p.pos] == ':' {
			p.pos++
		}
		val, err := p.parseTernary()
		if err != nil {
			return nil, err
		}
		obj[key] = val
		p.skipWS()
		if p.pos < len(p.input) && p.input[p.pos] == ',' {
			p.pos++
		}
	}
	if p.pos < len(p.input) && p.input[p.pos] == '}' {
		p.pos++
	}
	return obj, nil
}

func (p *parser) parseIdentOrKeyword() (any, error) {
	name, err := p.parseIdent()
	if err != nil {
		return nil, err
	}
	switch name {
	case "true":
		return true, nil
	case "false":
		return false, nil
	case "null", "undefined":
		return nil, nil
	case "NaN":
		return math.NaN(), nil
	case "Infinity":
		return math.Inf(1), nil
	}
	// Scope lookup
	if p.scope != nil {
		if v, ok := p.scope[name]; ok {
			return v, nil
		}
	}
	// Unknown identifier — return nil (like JS undefined)
	return nil, nil
}

func (p *parser) parseIdent() (string, error) {
	p.skipWS()
	if p.pos >= len(p.input) || !isIdentStart(p.input[p.pos]) {
		return "", fmt.Errorf("expected identifier at %q", p.input[p.pos:])
	}
	start := p.pos
	for p.pos < len(p.input) && isIdentPart(p.input[p.pos]) {
		p.pos++
	}
	return p.input[start:p.pos], nil
}

// ─── helpers ─────────────────────────────────────────────────────────────────

func isWS(c byte) bool {
	return c == ' ' || c == '\t' || c == '\n' || c == '\r'
}

func isIdentStart(c byte) bool {
	return c == '_' || c == '$' || (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c > 127 && unicode.IsLetter(rune(c))
}

func isIdentPart(c byte) bool {
	return isIdentStart(c) || (c >= '0' && c <= '9')
}

func truthy(v any) bool {
	if v == nil {
		return false
	}
	switch t := v.(type) {
	case bool:
		return t
	case float64:
		return t != 0 && !math.IsNaN(t)
	case string:
		return t != ""
	case []any:
		return true
	case map[string]any:
		return true
	}
	return true
}

func toNumber(v any) (float64, bool) {
	switch t := v.(type) {
	case float64:
		return t, true
	case bool:
		if t {
			return 1, true
		}
		return 0, true
	case string:
		n, err := strconv.ParseFloat(strings.TrimSpace(t), 64)
		if err != nil {
			return 0, false
		}
		return n, true
	case nil:
		return 0, true
	}
	return 0, false
}

func addValues(a, b any) any {
	// If either is a string, concatenate
	as, aStr := a.(string)
	bs, bStr := b.(string)
	if aStr || bStr {
		return fmt.Sprintf("%v%v", as+bStr2str(a, aStr), bs+bStr2str(b, bStr))
	}
	if an, ok := toNumber(a); ok {
		if bn, ok := toNumber(b); ok {
			return an + bn
		}
	}
	return fmt.Sprintf("%v%v", a, b)
}

func bStr2str(v any, isStr bool) string {
	if isStr {
		return ""
	}
	return fmt.Sprintf("%v", v)
}

func numOp(a, b any, fn func(float64, float64) float64) any {
	an, _ := toNumber(a)
	bn, _ := toNumber(b)
	return fn(an, bn)
}

func looseEq(a, b any) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	// Both numeric
	an, aOK := toNumber(a)
	bn, bOK := toNumber(b)
	if aOK && bOK {
		return an == bn
	}
	return fmt.Sprintf("%v", a) == fmt.Sprintf("%v", b)
}

func compareOp(a, b any) int {
	an, aOK := toNumber(a)
	bn, bOK := toNumber(b)
	if aOK && bOK {
		if an < bn {
			return -1
		}
		if an > bn {
			return 1
		}
		return 0
	}
	as := fmt.Sprintf("%v", a)
	bs := fmt.Sprintf("%v", b)
	if as < bs {
		return -1
	}
	if as > bs {
		return 1
	}
	return 0
}

func memberAccess(obj any, name string) any {
	switch t := obj.(type) {
	case map[string]any:
		return t[name]
	case []any:
		if name == "length" {
			return float64(len(t))
		}
	case string:
		if name == "length" {
			return float64(len(t))
		}
	}
	return nil
}

func indexAccess(obj any, key any) any {
	switch t := obj.(type) {
	case []any:
		if n, ok := toNumber(key); ok {
			idx := int(n)
			if idx >= 0 && idx < len(t) {
				return t[idx]
			}
		}
	case map[string]any:
		return t[fmt.Sprintf("%v", key)]
	}
	return nil
}
