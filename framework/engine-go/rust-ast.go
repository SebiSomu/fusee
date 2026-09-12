package engine

import (
	"encoding/json"
	"fmt"
)

type Pos struct {
	Line   int `json:"line"`
	Col    int `json:"col"`
	Offset int `json:"offset"`
}

type Loc struct {
	Start Pos `json:"start"`
	End   Pos `json:"end"`
}

type Expression struct {
	Content  string `json:"content"`
	IsStatic bool   `json:"is_static"`
	IsForKey bool   `json:"is_for_key"`
	Loc      Loc    `json:"loc"`
}

type AttributeNode struct {
	Name  string  `json:"name"`
	Value *string `json:"value"`
	Loc   Loc     `json:"loc"`
}

type BindingNode struct {
	Name       string     `json:"name"`
	Expression Expression `json:"expression"`
	IsProp     bool       `json:"is_prop"`
	Loc        Loc        `json:"loc"`
}

type EventNode struct {
	Name       string     `json:"name"`
	Expression Expression `json:"expression"`
	Modifiers  []string   `json:"modifiers"`
	Loc        Loc        `json:"loc"`
}

type ForArg struct {
	Item   string  `json:"item"`
	Source string  `json:"source"`
	Index  *string `json:"index"`
	Loc    Loc     `json:"loc"`
}

type DirectiveNode struct {
	Name       string      `json:"name"`
	Expression *Expression `json:"expression"`
	Arg        *ForArg     `json:"arg"`
	Loc        Loc         `json:"loc"`
}

type PropType string

const (
	PropAttribute PropType = "Attribute"
	PropBinding   PropType = "Binding"
	PropEvent     PropType = "Event"
	PropDirective PropType = "Directive"
)

type Prop struct {
	Type      PropType
	Attribute *AttributeNode
	Binding   *BindingNode
	Event     *EventNode
	Directive *DirectiveNode
}

func (p *Prop) UnmarshalJSON(data []byte) error {
	var probe struct {
		Type PropType `json:"type"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return err
	}
	p.Type = probe.Type
	switch probe.Type {
	case PropAttribute:
		p.Attribute = &AttributeNode{}
		return json.Unmarshal(data, p.Attribute)
	case PropBinding:
		p.Binding = &BindingNode{}
		return json.Unmarshal(data, p.Binding)
	case PropEvent:
		p.Event = &EventNode{}
		return json.Unmarshal(data, p.Event)
	case PropDirective:
		p.Directive = &DirectiveNode{}
		return json.Unmarshal(data, p.Directive)
	default:
		return fmt.Errorf("rustast: unknown Prop type %q", probe.Type)
	}
}

func (p Prop) MarshalJSON() ([]byte, error) {
	switch p.Type {
	case PropAttribute:
		return marshalTagged("Attribute", p.Attribute)
	case PropBinding:
		return marshalTagged("Binding", p.Binding)
	case PropEvent:
		return marshalTagged("Event", p.Event)
	case PropDirective:
		return marshalTagged("Directive", p.Directive)
	default:
		return nil, fmt.Errorf("rustast: unknown Prop type %q", p.Type)
	}
}

func marshalTagged(typeName string, v any) ([]byte, error) {
	inner, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	var m map[string]json.RawMessage
	if err := json.Unmarshal(inner, &m); err != nil {
		return nil, err
	}
	m["type"] = json.RawMessage(`"` + typeName + `"`)
	return json.Marshal(m)
}

type NodeType string

const (
	NodeRoot          NodeType = "Root"
	NodeElement       NodeType = "Element"
	NodeComponent     NodeType = "Component"
	NodeText          NodeType = "Text"
	NodeInterpolation NodeType = "Interpolation"
	NodeSlotOutlet    NodeType = "SlotOutlet"
	NodeSlotContent   NodeType = "SlotContent"
	NodeIf            NodeType = "If"
)

type RootNode struct {
	Children []*Node `json:"children"`
	Hoisted  []int   `json:"hoisted"`
	Loc      Loc     `json:"loc"`
}

type ElementNode struct {
	ID          int     `json:"id"`
	Tag         string  `json:"tag"`
	Props       []*Prop `json:"props"`
	Children    []*Node `json:"children"`
	SelfClosing bool    `json:"self_closing"`
	IsStatic    bool    `json:"is_static"`
	Hoisted     bool    `json:"hoisted"`
	Loc         Loc     `json:"loc"`
}

type SlotEntry struct {
	Name     string
	Children []*Node
}

func (s *SlotEntry) UnmarshalJSON(data []byte) error {
	var tuple [2]json.RawMessage
	if err := json.Unmarshal(data, &tuple); err != nil {
		return fmt.Errorf("rustast: slot entry is not a 2-element array: %w", err)
	}
	if err := json.Unmarshal(tuple[0], &s.Name); err != nil {
		return err
	}
	return json.Unmarshal(tuple[1], &s.Children)
}

func (s SlotEntry) MarshalJSON() ([]byte, error) {
	return json.Marshal([2]any{s.Name, s.Children})
}

type ComponentNode struct {
	ID    int          `json:"id"`
	Name  string       `json:"name"`
	Props []*Prop      `json:"props"`
	Slots []*SlotEntry `json:"slots"`
	Loc   Loc          `json:"loc"`
}

func (c *ComponentNode) Slot(name string) []*Node {
	for _, s := range c.Slots {
		if s.Name == name {
			return s.Children
		}
	}
	return nil
}

type TextNode struct {
	Content  string `json:"content"`
	IsStatic bool   `json:"is_static"`
	Loc      Loc    `json:"loc"`
}

type InterpolationNode struct {
	Expression Expression `json:"expression"`
	IsStatic   bool       `json:"is_static"`
	Loc        Loc        `json:"loc"`
}

type SlotOutletNode struct {
	SlotName string  `json:"slot_name"`
	Fallback []*Node `json:"fallback"`
	Loc      Loc     `json:"loc"`
}

type SlotContentNode struct {
	SlotName string  `json:"slot_name"`
	Children []*Node `json:"children"`
	Loc      Loc     `json:"loc"`
}

type Branch struct {
	Condition *Expression `json:"condition"`
	Node      *Node       `json:"node"`
}

type IfNode struct {
	Branches []Branch `json:"branches"`
	Loc      Loc      `json:"loc"`
}

type Node struct {
	Type NodeType

	Root          *RootNode
	Element       *ElementNode
	Component     *ComponentNode
	Text          *TextNode
	Interpolation *InterpolationNode
	SlotOutlet    *SlotOutletNode
	SlotContent   *SlotContentNode
	If            *IfNode
}

func (n *Node) UnmarshalJSON(data []byte) error {
	var probe struct {
		Type NodeType `json:"type"`
	}
	if err := json.Unmarshal(data, &probe); err != nil {
		return err
	}
	n.Type = probe.Type
	switch probe.Type {
	case NodeRoot:
		n.Root = &RootNode{}
		return json.Unmarshal(data, n.Root)
	case NodeElement:
		n.Element = &ElementNode{}
		return json.Unmarshal(data, n.Element)
	case NodeComponent:
		n.Component = &ComponentNode{}
		return json.Unmarshal(data, n.Component)
	case NodeText:
		n.Text = &TextNode{}
		return json.Unmarshal(data, n.Text)
	case NodeInterpolation:
		n.Interpolation = &InterpolationNode{}
		return json.Unmarshal(data, n.Interpolation)
	case NodeSlotOutlet:
		n.SlotOutlet = &SlotOutletNode{}
		return json.Unmarshal(data, n.SlotOutlet)
	case NodeSlotContent:
		n.SlotContent = &SlotContentNode{}
		return json.Unmarshal(data, n.SlotContent)
	case NodeIf:
		n.If = &IfNode{}
		return json.Unmarshal(data, n.If)
	default:
		return fmt.Errorf("rustast: unknown Node type %q", probe.Type)
	}
}

func (n *Node) Props() []*Prop {
	switch n.Type {
	case NodeElement:
		return n.Element.Props
	case NodeComponent:
		return n.Component.Props
	}
	return nil
}

func (n *Node) FindDirective(name string) *DirectiveNode {
	for _, p := range n.Props() {
		if p.Type == PropDirective && p.Directive.Name == name {
			return p.Directive
		}
	}
	return nil
}

func ParseAST(data []byte) (*Node, error) {
	var n Node
	if err := json.Unmarshal(data, &n); err != nil {
		return nil, fmt.Errorf("rustast: failed to parse AST JSON: %w", err)
	}
	return &n, nil
}
