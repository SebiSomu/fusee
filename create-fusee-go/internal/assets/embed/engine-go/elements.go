package engine

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"fusee/evalexpr"
	"fusee/rustast"
)

// maxElementDepth bounds element-in-element nesting so a self-rendering element fails
// instead of recursing forever.
const maxElementDepth = 50

// ElementProp mirrors one prop declared with defineElement().
type ElementProp struct {
	Name      string `json:"name"`
	Attribute string `json:"attribute"` // "" for property-only props (attribute: false)
	Type      string `json:"type"`      // "String", "Number", "Boolean", "Array", "Object" or ""
	Default   any    `json:"default"`
	Reflect   bool   `json:"reflect"`
}

// ElementShadow mirrors the shadow root options of an element.
type ElementShadow struct {
	Mode           string `json:"mode"`
	DelegatesFocus bool   `json:"delegatesFocus"`
}

// Element is a custom element registered with defineElement(), rendered server-side as
// declarative shadow DOM. Setup is optional and plays the role of the JS setup():
// it receives the resolved props and returns the template scope. Without it, the
// template sees each prop by name and the whole set as `props`.
type Element struct {
	Tag    string                                             `json:"tag"`
	Props  []ElementProp                                      `json:"props"`
	Styles string                                             `json:"styles"`
	Shadow ElementShadow                                      `json:"shadow"`
	AST    *rustast.Node                                      `json:"ast"`
	Setup  func(props evalexpr.Scope) (evalexpr.Scope, error) `json:"-"`
}

// ElementRegistry maps lowercase tag names to element definitions.
type ElementRegistry map[string]*Element

// NewElementRegistry indexes elements by lowercase tag name, skipping entries without an AST.
func NewElementRegistry(elements []*Element) ElementRegistry {
	reg := ElementRegistry{}
	for _, el := range elements {
		if el == nil || el.AST == nil || el.Tag == "" {
			continue
		}
		reg[strings.ToLower(el.Tag)] = el
	}
	return reg
}

func (reg ElementRegistry) lookup(tag string) *Element {
	if reg == nil || !strings.Contains(tag, "-") {
		return nil
	}
	return reg[strings.ToLower(tag)]
}

func (p ElementProp) matches(name string) bool {
	return strings.EqualFold(name, p.Name) || (p.Attribute != "" && strings.EqualFold(name, p.Attribute))
}

// propFromAttribute converts a static attribute value (nil when present without a value)
// to the prop's type, mirroring the client converters. ok is false when the value cannot
// be converted, in which case the default applies.
func (p ElementProp) propFromAttribute(value *string) (any, bool) {
	if p.Type == "Boolean" {
		return true, true
	}
	if value == nil {
		return nil, false
	}
	switch p.Type {
	case "Number":
		if *value == "" {
			return nil, false
		}
		f, err := strconv.ParseFloat(*value, 64)
		if err != nil {
			return nil, false
		}
		return f, true
	case "Array", "Object":
		var v any
		if err := json.Unmarshal([]byte(*value), &v); err != nil {
			return nil, false
		}
		return v, true
	default:
		return *value, true
	}
}

// propToAttribute converts a prop value to its attribute form; ok is false when the
// attribute should be absent.
func (p ElementProp) propToAttribute(value any) (string, bool) {
	if p.Type == "Boolean" {
		return "", truthyForClass(value)
	}
	if value == nil {
		return "", false
	}
	if p.Type == "Array" || p.Type == "Object" {
		raw, err := json.Marshal(value)
		if err != nil {
			return "", false
		}
		return string(raw), true
	}
	return displayString(value), true
}

// resolveElementProps builds the props scope from the element's static attributes and
// bindings. It also returns the reflected attributes that must be added to the tag
// because nothing in the template set them.
func resolveElementProps(el *Element, props []*rustast.Prop, scope evalexpr.Scope) (evalexpr.Scope, [][2]string, error) {
	resolved := evalexpr.Scope{}
	var reflected [][2]string

	for _, def := range el.Props {
		value, found := def.Default, false

		for _, p := range props {
			switch p.Type {
			case rustast.PropAttribute:
				if def.Attribute == "" || !strings.EqualFold(p.Attribute.Name, def.Attribute) {
					continue
				}
				found = true
				if v, ok := def.propFromAttribute(p.Attribute.Value); ok {
					value = v
				}
			case rustast.PropBinding:
				if !def.matches(p.Binding.Name) {
					continue
				}
				found = true
				v, err := evalexpr.Eval(p.Binding.Expression.Content, scope)
				if err != nil {
					return nil, nil, err
				}
				if v != nil {
					value = v
				}
			}
		}

		resolved[def.Name] = value
		if def.Reflect && !found {
			if attr, ok := def.propToAttribute(value); ok {
				reflected = append(reflected, [2]string{def.Attribute, attr})
			}
		}
	}

	return resolved, reflected, nil
}

// elementScope runs the element's Go Setup, or exposes the props directly to the template.
func elementScope(el *Element, props evalexpr.Scope) (evalexpr.Scope, error) {
	if el.Setup != nil {
		return el.Setup(props)
	}
	scope := cloneScope(props)
	scope["props"] = map[string]any(props)
	return scope, nil
}

// slotOutlets makes every slot outlet in a shadow template render as a native <slot>.
func slotOutlets(ast *rustast.Node) map[string][]*rustast.Node {
	outlets := map[string][]*rustast.Node{}
	var walk func(nodes []*rustast.Node)
	walk = func(nodes []*rustast.Node) {
		for _, n := range nodes {
			switch n.Type {
			case rustast.NodeSlotOutlet:
				name := n.SlotOutlet.SlotName
				tag := "<slot></slot>"
				if name != "default" {
					tag = fmt.Sprintf(`<slot name="%s"></slot>`, escapeAttr(name))
				}
				outlets[name] = []*rustast.Node{{Type: rustast.NodeText, Text: &rustast.TextNode{Content: tag}}}
				walk(n.SlotOutlet.Fallback)
			case rustast.NodeElement:
				walk(n.Element.Children)
			case rustast.NodeComponent:
				for _, s := range n.Component.Slots {
					walk(s.Children)
				}
			case rustast.NodeIf:
				for _, b := range n.If.Branches {
					walk([]*rustast.Node{b.Node})
				}
			}
		}
	}
	walk(ast.Root.Children)
	return outlets
}

// renderShadowRoot writes `<template shadowrootmode>` with the element's styles and its
// template rendered against the resolved props.
func (r *Renderer) renderShadowRoot(el *Element, props evalexpr.Scope, sb *strings.Builder) error {
	if r.depth >= maxElementDepth {
		return fmt.Errorf("render: elements nested deeper than %d levels at <%s> (recursive element?)", maxElementDepth, el.Tag)
	}

	scope, err := elementScope(el, props)
	if err != nil {
		return fmt.Errorf("render: setup of <%s> failed: %w", el.Tag, err)
	}
	scope = cloneScope(scope)
	scope["_slots"] = slotOutlets(el.AST)

	child := NewRenderer(r.Components)
	child.Elements = r.Elements
	child.depth = r.depth + 1
	html, err := child.renderRoot(el.AST, scope)
	if err != nil {
		return err
	}

	mode := "open"
	if el.Shadow.Mode == "closed" {
		mode = "closed"
	}
	fmt.Fprintf(sb, `<template shadowrootmode="%s"`, mode)
	if el.Shadow.DelegatesFocus {
		sb.WriteString(" shadowrootdelegatesfocus")
	}
	sb.WriteByte('>')
	if el.Styles != "" {
		sb.WriteString("<style>")
		sb.WriteString(strings.ReplaceAll(el.Styles, "</style", `<\/style`))
		sb.WriteString("</style>")
	}
	sb.WriteString(html)
	sb.WriteString("</template>")
	return nil
}
