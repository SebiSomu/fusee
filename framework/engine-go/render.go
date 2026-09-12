package engine

import (
	"fmt"
	"strconv"
	"strings"

	"fusee/evalexpr"
	"fusee/rustast"
)

type Component struct {
	AST   *rustast.Node
	Setup func(props evalexpr.Scope) (evalexpr.Scope, error)
}

type Renderer struct {
	Components map[string]*Component

	anchorIdx    int
	hoistedByID  map[int]*rustast.Node // id -> the actual ElementNode Node, built once per Render call
	hoistedCache map[int]string        // id -> cached rendered HTML, built once per Render call
	hoistedIDs   map[int]bool
}

func NewRenderer(components map[string]*Component) *Renderer {
	if components == nil {
		components = map[string]*Component{}
	}
	return &Renderer{Components: components}
}

func Render(root *rustast.Node, scope evalexpr.Scope) (string, error) {
	if root.Type != rustast.NodeRoot {
		return "", fmt.Errorf("render: expected a Root node, got %s", root.Type)
	}
	r := NewRenderer(nil)
	return r.renderRoot(root, scope)
}

func RenderWithComponents(root *rustast.Node, scope evalexpr.Scope, components map[string]*Component) (string, error) {
	if root.Type != rustast.NodeRoot {
		return "", fmt.Errorf("render: expected a Root node, got %s", root.Type)
	}
	r := NewRenderer(components)
	return r.renderRoot(root, scope)
}

func (r *Renderer) renderRoot(root *rustast.Node, scope evalexpr.Scope) (string, error) {
	r.anchorIdx = 0
	r.hoistedByID = map[int]*rustast.Node{}
	r.hoistedCache = map[int]string{}
	r.hoistedIDs = map[int]bool{}

	for _, id := range root.Root.Hoisted {
		r.hoistedIDs[id] = true
	}
	collectElementRefs(root.Root.Children, r.hoistedByID)

	var sb strings.Builder
	if err := r.renderChildren(root.Root.Children, scope, &sb); err != nil {
		return "", err
	}
	return sb.String(), nil
}

func collectElementRefs(nodes []*rustast.Node, out map[int]*rustast.Node) {
	for _, n := range nodes {
		switch n.Type {
		case rustast.NodeElement:
			out[n.Element.ID] = n
			collectElementRefs(n.Element.Children, out)
		case rustast.NodeComponent:
			for _, slot := range n.Component.Slots {
				collectElementRefs(slot.Children, out)
			}
		case rustast.NodeIf:
			for _, b := range n.If.Branches {
				collectElementRefs([]*rustast.Node{b.Node}, out)
			}
		}
	}
}

func (r *Renderer) nextAnchor() int {
	id := r.anchorIdx
	r.anchorIdx++
	return id
}

func (r *Renderer) renderChildren(nodes []*rustast.Node, scope evalexpr.Scope, sb *strings.Builder) error {
	for _, n := range nodes {
		if forDir := findForDir(n); forDir != nil {
			if err := r.renderFor(n, forDir, scope, sb); err != nil {
				return err
			}
			continue
		}
		if err := r.renderNode(n, scope, sb, false); err != nil {
			return err
		}
	}
	return nil
}

func findForDir(n *rustast.Node) *rustast.DirectiveNode {
	for _, p := range n.Props() {
		if p.Type == rustast.PropDirective && p.Directive.Name == "for" {
			return p.Directive
		}
	}
	return nil
}

func (r *Renderer) renderNode(n *rustast.Node, scope evalexpr.Scope, sb *strings.Builder, inHoist bool) error {
	if !inHoist && n.Type == rustast.NodeElement && r.hoistedIDs[n.Element.ID] {
		cached, ok := r.hoistedCache[n.Element.ID]
		if !ok {
			var hb strings.Builder
			if err := r.renderElement(n.Element, scope, &hb, true); err != nil {
				return err
			}
			cached = hb.String()
			r.hoistedCache[n.Element.ID] = cached
		}
		sb.WriteString(cached)
		return nil
	}

	switch n.Type {
	case rustast.NodeText:
		sb.WriteString(n.Text.Content)
		return nil
	case rustast.NodeInterpolation:
		return r.renderInterpolation(n.Interpolation, scope, sb)
	case rustast.NodeElement:
		return r.renderElement(n.Element, scope, sb, inHoist)
	case rustast.NodeComponent:
		return r.renderComponent(n.Component, scope, sb)
	case rustast.NodeSlotOutlet:
		return r.renderSlotOutlet(n.SlotOutlet, scope, sb)
	case rustast.NodeIf:
		return r.renderIf(n.If, scope, sb)
	default:
		return fmt.Errorf("render: unexpected node type %s here", n.Type)
	}
}

func (r *Renderer) renderInterpolation(n *rustast.InterpolationNode, scope evalexpr.Scope, sb *strings.Builder) error {
	if n.Expression.IsStatic {
		v, err := evalexpr.Eval(n.Expression.Content, scope)
		if err != nil {
			return err
		}
		sb.WriteString(escapeHTML(displayString(v)))
		return nil
	}

	id := r.nextAnchor()
	v, err := evalexpr.Eval(n.Expression.Content, scope)
	if err != nil {
		return err
	}
	fmt.Fprintf(sb, "<!--f-bind:%d-->%s<!--/f-bind:%d-->", id, escapeHTML(displayString(v)), id)
	return nil
}

var voidElements = map[string]bool{
	"area": true, "base": true, "br": true, "col": true, "embed": true,
	"hr": true, "img": true, "input": true, "link": true, "meta": true,
	"param": true, "source": true, "track": true, "wbr": true,
}

func (r *Renderer) renderElement(n *rustast.ElementNode, scope evalexpr.Scope, sb *strings.Builder, inHoist bool) error {
	isVoid := n.SelfClosing || voidElements[strings.ToLower(n.Tag)]

	var htmlDir *rustast.DirectiveNode
	needsAnchor := false
	for _, p := range n.Props {
		switch p.Type {
		case rustast.PropDirective:
			if p.Directive.Name == "html" {
				htmlDir = p.Directive
			}
			if p.Directive.Name != "if" && p.Directive.Name != "else-if" && p.Directive.Name != "else" && p.Directive.Name != "for" {
				needsAnchor = true
			}
		case rustast.PropBinding, rustast.PropEvent:
			needsAnchor = true
		}
	}

	var anchorID int
	hasAnchor := false
	if needsAnchor {
		anchorID = r.nextAnchor()
		hasAnchor = true
	}

	sb.WriteByte('<')
	sb.WriteString(n.Tag)
	if err := r.renderAttrs(n.Props, scope, sb); err != nil {
		return err
	}
	if hasAnchor {
		fmt.Fprintf(sb, ` data-f-id="%d"`, anchorID)
	}
	if isVoid {
		sb.WriteString("/>")
		return nil
	}
	sb.WriteByte('>')

	if htmlDir != nil {
		v, err := evalexpr.Eval(htmlDir.Expression.Content, scope)
		if err != nil {
			return err
		}
		sb.WriteString(displayString(v))
	} else {
		if err := r.renderChildren(n.Children, scope, sb); err != nil {
			return err
		}
	}

	sb.WriteString("</")
	sb.WriteString(n.Tag)
	sb.WriteByte('>')
	return nil
}

func (r *Renderer) renderAttrs(props []*rustast.Prop, scope evalexpr.Scope, sb *strings.Builder) error {
	for _, p := range props {
		switch p.Type {
		case rustast.PropAttribute:
			renderStaticAttr(p.Attribute, sb)
		case rustast.PropBinding:
			if err := r.renderBindingAttr(p.Binding, scope, sb); err != nil {
				return err
			}
		case rustast.PropDirective:
			if err := r.renderDirectiveAttr(p.Directive, scope, sb); err != nil {
				return err
			}
		}
	}
	return nil
}

func renderStaticAttr(a *rustast.AttributeNode, sb *strings.Builder) {
	if a.Value == nil {
		fmt.Fprintf(sb, " %s", a.Name)
		return
	}
	fmt.Fprintf(sb, ` %s="%s"`, a.Name, escapeAttr(*a.Value))
}

func (r *Renderer) renderBindingAttr(b *rustast.BindingNode, scope evalexpr.Scope, sb *strings.Builder) error {
	if b.IsProp {
		return nil
	}
	v, err := evalexpr.Eval(b.Expression.Content, scope)
	if err != nil {
		return err
	}
	switch b.Name {
	case "class":
		fmt.Fprintf(sb, ` class="%s"`, escapeAttr(renderClass(v)))
	case "style":
		fmt.Fprintf(sb, ` style="%s"`, escapeAttr(renderStyle(v)))
	default:
		if v == false || v == nil {
			return nil
		}
		if v == true {
			fmt.Fprintf(sb, " %s", b.Name)
			return nil
		}
		fmt.Fprintf(sb, ` %s="%s"`, b.Name, escapeAttr(displayString(v)))
	}
	return nil
}

func (r *Renderer) renderDirectiveAttr(d *rustast.DirectiveNode, scope evalexpr.Scope, sb *strings.Builder) error {
	switch d.Name {
	case "show":
		v, err := evalexpr.EvalBool(d.Expression.Content, scope)
		if err != nil {
			return err
		}
		if !v {
			sb.WriteString(` style="display:none"`)
		}
	case "model":
		v, err := evalexpr.Eval(d.Expression.Content, scope)
		if err != nil {
			return err
		}
		fmt.Fprintf(sb, ` value="%s"`, escapeAttr(displayString(v)))
	}
	return nil
}

func (r *Renderer) renderIf(n *rustast.IfNode, scope evalexpr.Scope, sb *strings.Builder) error {
	id := r.nextAnchor()
	fmt.Fprintf(sb, "<!--f-if:%d-->", id)

	for _, branch := range n.Branches {
		take := branch.Condition == nil
		if !take {
			var err error
			take, err = evalexpr.EvalBool(branch.Condition.Content, scope)
			if err != nil {
				return err
			}
		}
		if take {
			if err := r.renderNode(branch.Node, scope, sb, false); err != nil {
				return err
			}
			break
		}
	}

	fmt.Fprintf(sb, "<!--/f-if:%d-->", id)
	return nil
}

func (r *Renderer) renderFor(n *rustast.Node, forDir *rustast.DirectiveNode, scope evalexpr.Scope, sb *strings.Builder) error {
	id := r.nextAnchor()
	arg := forDir.Arg

	src, err := evalexpr.Eval(arg.Source, scope)
	if err != nil {
		return err
	}
	items, indices, keys := enumerate(src)

	fmt.Fprintf(sb, "<!--f-for:%d-->", id)
	for i, item := range items {
		childScope := cloneScope(scope)
		childScope[arg.Item] = item
		if arg.Index != nil {
			childScope[*arg.Index] = indices[i]
		}

		var key any
		if keyBinding := findKeyBinding(n); keyBinding != nil {
			key, err = evalexpr.Eval(keyBinding.Expression.Content, childScope)
			if err != nil {
				return err
			}
		} else {
			key = keys[i]
		}

		fmt.Fprintf(sb, "<!--f-for-item:%d:%s-->", id, escapeAttr(displayString(key)))
		if err := r.renderNode(n, childScope, sb, false); err != nil {
			return err
		}
		sb.WriteString(fmt.Sprintf("<!--/f-for-item:%d-->", id))
	}
	fmt.Fprintf(sb, "<!--/f-for:%d-->", id)
	return nil
}

func findKeyBinding(n *rustast.Node) *rustast.BindingNode {
	for _, p := range n.Props() {
		if p.Type == rustast.PropBinding && p.Binding.Name == "key" {
			return p.Binding
		}
	}
	return nil
}

func enumerate(src any) (items []any, indices []any, keys []any) {
	switch t := src.(type) {
	case []any:
		for i, v := range t {
			items = append(items, v)
			indices = append(indices, float64(i))
			keys = append(keys, float64(i))
		}
	case map[string]any:
		i := 0
		for k, v := range t {
			items = append(items, v)
			indices = append(indices, float64(i))
			keys = append(keys, k)
			i++
		}
	}
	return
}

func cloneScope(scope evalexpr.Scope) evalexpr.Scope {
	out := make(evalexpr.Scope, len(scope)+2)
	for k, v := range scope {
		out[k] = v
	}
	return out
}

func (r *Renderer) renderComponent(n *rustast.ComponentNode, scope evalexpr.Scope, sb *strings.Builder) error {
	id := r.nextAnchor()
	fmt.Fprintf(sb, "<!--f-component:%s:%d-->", n.Name, id)

	comp, ok := r.Components[n.Name]
	if !ok || comp == nil || comp.AST == nil {
		fmt.Fprintf(sb, "<!--/f-component:%d-->", id)
		return nil
	}

	props := evalexpr.Scope{}
	for _, p := range n.Props {
		switch p.Type {
		case rustast.PropAttribute:
			if p.Attribute.Value != nil {
				props[p.Attribute.Name] = *p.Attribute.Value
			} else {
				props[p.Attribute.Name] = true
			}
		case rustast.PropBinding:
			v, err := evalexpr.Eval(p.Binding.Expression.Content, scope)
			if err != nil {
				return err
			}
			props[p.Binding.Name] = v
		}
	}

	childScope := props
	if comp.Setup != nil {
		extra, err := comp.Setup(props)
		if err != nil {
			return err
		}
		childScope = mergeScopes(props, extra)
	}

	if len(n.Slots) > 0 {
		slotsMap := make(map[string][]*rustast.Node, len(n.Slots))
		for _, s := range n.Slots {
			slotsMap[s.Name] = s.Children
		}
		childScope = cloneScope(childScope)
		childScope["_slots"] = slotsMap
	}

	childR := NewRenderer(r.Components)
	html, err := childR.renderRoot(comp.AST, childScope)
	if err != nil {
		return err
	}
	sb.WriteString(html)

	fmt.Fprintf(sb, "<!--/f-component:%d-->", id)
	return nil
}

func mergeScopes(base, overlay evalexpr.Scope) evalexpr.Scope {
	out := make(evalexpr.Scope, len(base)+len(overlay))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overlay {
		out[k] = v
	}
	return out
}

func (r *Renderer) renderSlotOutlet(n *rustast.SlotOutletNode, scope evalexpr.Scope, sb *strings.Builder) error {
	id := r.nextAnchor()
	fmt.Fprintf(sb, "<!--f-slot:%d-->", id)

	provided, _ := scope["_slots"].(map[string][]*rustast.Node)
	content, ok := provided[n.SlotName]
	if !ok {
		content = n.Fallback
	}
	if err := r.renderChildren(content, scope, sb); err != nil {
		return err
	}

	fmt.Fprintf(sb, "<!--/f-slot:%d-->", id)
	return nil
}

func escapeHTML(s string) string {
	var sb strings.Builder
	for _, c := range s {
		switch c {
		case '&':
			sb.WriteString("&amp;")
		case '<':
			sb.WriteString("&lt;")
		case '>':
			sb.WriteString("&gt;")
		case '"':
			sb.WriteString("&quot;")
		case '\'':
			sb.WriteString("&#39;")
		default:
			sb.WriteRune(c)
		}
	}
	return sb.String()
}

func escapeAttr(s string) string { return escapeHTML(s) }

func displayString(v any) string {
	switch t := v.(type) {
	case nil:
		return ""
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	default:
		return fmt.Sprintf("%v", t)
	}
}

func renderClass(v any) string {
	switch t := v.(type) {
	case []any:
		var parts []string
		for _, item := range t {
			if s, ok := item.(string); ok && s != "" {
				parts = append(parts, s)
			}
		}
		return strings.Join(parts, " ")
	case map[string]any:
		var parts []string
		for k, val := range t {
			if truthyForClass(val) {
				parts = append(parts, k)
			}
		}
		return strings.Join(parts, " ")
	default:
		return displayString(v)
	}
}

func truthyForClass(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case nil:
		return false
	default:
		return true
	}
}

func renderStyle(v any) string {
	if m, ok := v.(map[string]any); ok {
		var parts []string
		for k, val := range m {
			parts = append(parts, fmt.Sprintf("%s:%s", kebabCase(k), displayString(val)))
		}
		return strings.Join(parts, ";")
	}
	return displayString(v)
}

func kebabCase(s string) string {
	var sb strings.Builder
	for _, c := range s {
		if c >= 'A' && c <= 'Z' {
			sb.WriteByte('-')
			sb.WriteRune(c - 'A' + 'a')
		} else {
			sb.WriteRune(c)
		}
	}
	return sb.String()
}
