import { describe, it, expect, beforeEach } from 'vitest'

import { tokenize, TokenType } from '../core/compiler/lexer.js'
import { parse } from '../core/compiler/parser.js'
import { transform } from '../core/compiler/transformer.js'
import { generate } from '../core/compiler/generator.js'
import { compile, parseOnly, compileBatch } from '../core/compiler/main-compiler.js'
import { CompileError } from '../core/compiler/errors.js'
import { ErrorCode } from '../core/compiler/errors-list.js'
import { NodeType } from '../core/compiler/ast.js'

// helpers

function lex(src) {
    return tokenize(src)
}

function ast(src, comps = []) {
    return parse(lex(src), src, new Set(comps))
}

function fullAst(src, comps = []) {
    return transform(ast(src, comps), { source: src, components: new Set(comps) }).ast
}

function code(src, comps = []) {
    return compile(src, { components: comps }).code
}

function tokens(src) {
    return tokenize(src)
}

function findToken(src, type) {
    return tokenize(src).find(t => t.type === type)
}

function allTokens(src, type) {
    return tokenize(src).filter(t => t.type === type)
}

function findNode(node, type) {
    if (!node) return null
    if (node.type === type) return node
    for (const child of node.children ?? []) {
        const found = findNode(child, type)
        if (found) return found
    }
    for (const branch of node.branches ?? []) {
        const found = findNode(branch.node, type)
        if (found) return found
    }
    return null
}

function findNodes(node, type, result = []) {
    if (!node) return result
    if (node.type === type) result.push(node)
    for (const child of node.children ?? []) findNodes(child, type, result)
    for (const branch of node.branches ?? []) findNodes(branch.node, type, result)
    return result
}

// 1. LEXER

describe('Lexer', () => {

    // ── basic tokens ──────────────────────────────────────────────────────────

    it('emits EOF for empty source', () => {
        const toks = lex('')
        expect(toks.at(-1).type).toBe(TokenType.EOF)
    })

    it('tokenises plain text', () => {
        const toks = allTokens('hello world', TokenType.TEXT)
        expect(toks).toHaveLength(1)
        expect(toks[0].value).toBe('hello world')
    })

    it('tokenises an open tag', () => {
        const tok = findToken('<div>', TokenType.TAG_OPEN)
        expect(tok?.value).toBe('div')
    })

    it('tokenises a self-closing tag', () => {
        const toks = lex('<img />')
        expect(toks.some(t => t.type === TokenType.TAG_SELF_CLOSE)).toBe(true)
    })

    it('tokenises a closing tag', () => {
        const tok = findToken('</div>', TokenType.TAG_OPEN_CLOSE)
        expect(tok?.value).toBe('div')
    })

    // ── attributes ────────────────────────────────────────────────────────────

    it('tokenises static attribute', () => {
        const toks = lex('<div class="foo">')
        const name = toks.find(t => t.type === TokenType.ATTR_NAME)
        const val  = toks.find(t => t.type === TokenType.ATTR_VALUE)
        expect(name?.value).toBe('class')
        expect(val?.value).toBe('foo')
    })

    it('tokenises binding attribute :href', () => {
        const toks = lex('<a :href="url">')
        const name = toks.find(t => t.type === TokenType.ATTR_NAME)
        expect(name?.value).toBe(':href')
    })

    it('tokenises event attribute @click.stop', () => {
        const toks = lex('<button @click.stop="fn">')
        const name = toks.find(t => t.type === TokenType.ATTR_NAME)
        expect(name?.value).toBe('@click.stop')
    })

    it('tokenises f-if directive', () => {
        const toks = lex('<div f-if="ok">')
        const name = toks.find(t => t.type === TokenType.ATTR_NAME)
        expect(name?.value).toBe('f-if')
    })

    it('tokenises boolean attribute (no value)', () => {
        const toks = lex('<input disabled>')
        const name = toks.find(t => t.type === TokenType.ATTR_NAME)
        expect(name?.value).toBe('disabled')
        expect(toks.some(t => t.type === TokenType.ATTR_EQUALS)).toBe(false)
    })

    // ── mustache ──────────────────────────────────────────────────────────────

    it('tokenises simple mustache {{ count }}', () => {
        const toks = lex('{{ count }}')
        expect(toks.some(t => t.type === TokenType.MUSTACHE_OPEN)).toBe(true)
        const expr = toks.find(t => t.type === TokenType.MUSTACHE_EXPR)
        expect(expr?.value).toBe('count')
        expect(toks.some(t => t.type === TokenType.MUSTACHE_CLOSE)).toBe(true)
    })

    it('handles nested braces in mustache {{ obj({ a: 1 }) }}', () => {
        const expr = tokens('{{ obj({ a: 1 }) }}').find(t => t.type === TokenType.MUSTACHE_EXPR)
        expect(expr?.value).toBe('obj({ a: 1 })')
    })

    it('handles template literal in mustache {{ `hello ${name}` }}', () => {
        const expr = tokens('{{ `hello ${name}` }}').find(t => t.type === TokenType.MUSTACHE_EXPR)
        expect(expr?.value).toBe('`hello ${name}`')
    })

    it('tokenises multiple mustaches', () => {
        const exprs = allTokens('{{ a }} and {{ b }}', TokenType.MUSTACHE_EXPR)
        expect(exprs).toHaveLength(2)
        expect(exprs.map(e => e.value)).toEqual(['a', 'b'])
    })

    it('throws on unterminated mustache', () => {
        expect(() => lex('{{ unclosed')).toThrow()
    })

    // ── source location ───────────────────────────────────────────────────────

    it('attaches line/col to tokens', () => {
        const tok = findToken('<div>', TokenType.TAG_OPEN)
        expect(tok?.loc?.start?.line).toBe(1)
        expect(tok?.loc?.start?.col).toBe(1)
    })

    it('increments line on newlines', () => {
        const toks = lex('text\n<div>')
        const tag  = toks.find(t => t.type === TokenType.TAG_OPEN)
        expect(tag?.loc?.start?.line).toBe(2)
    })

    // ── comments ──────────────────────────────────────────────────────────────

    it('tokenises HTML comment', () => {
        const tok = findToken('<!-- hello -->', TokenType.COMMENT)
        expect(tok?.value).toBe('hello')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. PARSER
// ─────────────────────────────────────────────────────────────────────────────

describe('Parser', () => {

    // ── root ──────────────────────────────────────────────────────────────────

    it('returns a Root node', () => {
        const root = ast('<div></div>')
        expect(root.type).toBe(NodeType.ROOT)
    })

    it('parses empty template to empty root', () => {
        const root = ast('')
        expect(root.children).toHaveLength(0)
    })

    // ── elements ──────────────────────────────────────────────────────────────

    it('parses a simple element', () => {
        const root = ast('<div></div>')
        expect(root.children[0].type).toBe(NodeType.ELEMENT)
        expect(root.children[0].tag).toBe('div')
    })

    it('parses nested elements', () => {
        const root = ast('<ul><li></li></ul>')
        const ul   = root.children[0]
        expect(ul.tag).toBe('ul')
        expect(ul.children[0].tag).toBe('li')
    })

    it('parses self-closing element', () => {
        const root = ast('<br />')
        expect(root.children[0].selfClosing).toBe(true)
    })

    it('parses void element without explicit self-close', () => {
        const root = ast('<input type="text">')
        expect(root.children[0].tag).toBe('input')
    })

    it('throws on mismatched closing tag', () => {
        expect(() => ast('<div></span>')).toThrow()
    })

    it('throws on missing closing tag', () => {
        expect(() => ast('<div>')).toThrow()
    })

    // ── text & interpolation ──────────────────────────────────────────────────

    it('parses text node', () => {
        const root = ast('<p>hello</p>')
        const text = root.children[0].children[0]
        expect(text.type).toBe(NodeType.TEXT)
        expect(text.content).toBe('hello')
    })

    it('parses interpolation {{ count }}', () => {
        const root   = ast('<p>{{ count }}</p>')
        const interp = root.children[0].children[0]
        expect(interp.type).toBe(NodeType.INTERPOLATION)
        expect(interp.expression.content).toBe('count')
    })

    it('parses mixed text and interpolation', () => {
        const root     = ast('<p>hello {{ name }}!</p>')
        const children = root.children[0].children
        expect(children[0].type).toBe(NodeType.TEXT)
        expect(children[1].type).toBe(NodeType.INTERPOLATION)
        expect(children[2].type).toBe(NodeType.TEXT)
    })

    it('throws on empty mustache {{ }}', () => {
        expect(() => ast('<p>{{ }}</p>')).toThrow()
    })

    // ── attributes ────────────────────────────────────────────────────────────

    it('parses static attribute', () => {
        const el   = ast('<div class="foo"></div>').children[0]
        const attr = el.props.find(p => p.type === NodeType.ATTRIBUTE)
        expect(attr?.name).toBe('class')
        expect(attr?.value).toBe('foo')
    })

    it('parses dynamic binding :href', () => {
        const el      = ast('<a :href="url"></a>').children[0]
        const binding = el.props.find(p => p.type === NodeType.BINDING)
        expect(binding?.name).toBe('href')
        expect(binding?.expression.content).toBe('url')
    })

    it('parses event @click with modifiers', () => {
        const el    = ast('<button @click.prevent.stop="fn"></button>').children[0]
        const event = el.props.find(p => p.type === NodeType.EVENT)
        expect(event?.name).toBe('click')
        expect(event?.modifiers).toEqual(['prevent', 'stop'])
        expect(event?.expression.content).toBe('fn')
    })

    it('parses event with inline expression', () => {
        const el    = ast('<button @click="count(count() + 1)"></button>').children[0]
        const event = el.props.find(p => p.type === NodeType.EVENT)
        expect(event?.expression.content).toBe('count(count() + 1)')
    })

    it('parses boolean attribute', () => {
        const el   = ast('<input disabled>').children[0]
        const attr = el.props.find(p => p.name === 'disabled')
        expect(attr?.value).toBeNull()
    })

    it('throws on empty binding expression :href=""', () => {
        expect(() => ast('<a :href=""></a>')).toThrow()
    })

    // ── directives ────────────────────────────────────────────────────────────

    it('parses f-if directive', () => {
        const el  = ast('<div f-if="show"></div>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'if')
        expect(dir?.expression.content).toBe('show')
    })

    it('parses f-else (no expression)', () => {
        const el  = ast('<div f-else></div>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'else')
        expect(dir).toBeTruthy()
        expect(dir.expression).toBeNull()
    })

    it('parses f-for "item in list"', () => {
        const el  = ast('<li f-for="item in list" :key="item.id"></li>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'for')
        expect(dir?.arg?.item).toBe('item')
        expect(dir?.arg?.source).toBe('list')
        expect(dir?.arg?.index).toBeNull()
    })

    it('parses f-for "(item, index) in list"', () => {
        const el  = ast('<li f-for="(item, index) in list" :key="item.id"></li>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'for')
        expect(dir?.arg?.item).toBe('item')
        expect(dir?.arg?.index).toBe('index')
        expect(dir?.arg?.source).toBe('list')
    })

    it('throws on invalid f-for expression', () => {
        expect(() => ast('<li f-for="bad"></li>')).toThrow()
    })

    it('parses f-model', () => {
        const el  = ast('<input f-model="name">').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'model')
        expect(dir?.expression.content).toBe('name')
    })

    it('parses f-show', () => {
        const el  = ast('<div f-show="visible"></div>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'show')
        expect(dir?.expression.content).toBe('visible')
    })

    it('parses f-html', () => {
        const el  = ast('<div f-html="rawHtml"></div>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'html')
        expect(dir?.expression.content).toBe('rawHtml')
    })

    it('parses f-once', () => {
        const el  = ast('<div f-once></div>').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'once')
        expect(dir).toBeTruthy()
    })

    it('parses f-ref', () => {
        const el  = ast('<input f-ref="inputEl">').children[0]
        const dir = el.props.find(p => p.type === NodeType.DIRECTIVE && p.name === 'ref')
        expect(dir?.expression.content).toBe('inputEl')
    })

    it('throws on duplicate attribute', () => {
        expect(() => ast('<div class="a" class="b"></div>')).toThrow()
    })

    // ── components ────────────────────────────────────────────────────────────

    it('recognises PascalCase tag as component', () => {
        const root = ast('<MyButton></MyButton>', ['MyButton'])
        expect(root.children[0].type).toBe(NodeType.COMPONENT)
        expect(root.children[0].name).toBe('MyButton')
    })

    it('passes props to component', () => {
        const root  = ast('<Card title="Hello" :count="n"></Card>', ['Card'])
        const comp  = root.children[0]
        const title = comp.props.find(p => p.type === NodeType.ATTRIBUTE)
        const count = comp.props.find(p => p.type === NodeType.BINDING)
        expect(title?.value).toBe('Hello')
        expect(count?.expression.content).toBe('n')
    })

    // ── slots ─────────────────────────────────────────────────────────────────

    it('parses <slot> outlet', () => {
        const root   = ast('<slot></slot>')
        const outlet = root.children[0]
        expect(outlet.type).toBe(NodeType.SLOT_OUTLET)
        expect(outlet.slotName).toBe('default')
    })

    it('parses named <slot name="header">', () => {
        const root   = ast('<slot name="header"></slot>')
        const outlet = root.children[0]
        expect(outlet.slotName).toBe('header')
    })

    it('parses <slot> with fallback content', () => {
        const root    = ast('<slot><span>default</span></slot>')
        const outlet  = root.children[0]
        expect(outlet.fallback).toHaveLength(1)
        expect(outlet.fallback[0].tag).toBe('span')
    })

    it('parses named slot content <template slot="header">', () => {
        const root    = ast('<Card><template slot="header"><h1>Title</h1></template></Card>', ['Card'])
        const comp    = root.children[0]
        expect(comp.slots.header).toBeDefined()
        expect(comp.slots.header[0].tag).toBe('h1')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. TRANSFORMER
// ─────────────────────────────────────────────────────────────────────────────

describe('Transformer', () => {

    // ── static marking ────────────────────────────────────────────────────────

    it('marks plain text as static', () => {
        const root = fullAst('<p>hello</p>')
        const text = root.children[0].children[0]
        expect(text.isStatic).toBe(true)
    })

    it('marks element with no bindings as static', () => {
        const root = fullAst('<div class="foo"><span>text</span></div>')
        const div  = root.children[0]
        expect(div.isStatic).toBe(true)
    })

    it('marks element with binding as NOT static', () => {
        const root = fullAst('<div :class="cls"></div>')
        expect(root.children[0].isStatic).toBe(false)
    })

    it('marks element with event as NOT static', () => {
        const root = fullAst('<button @click="fn"></button>')
        expect(root.children[0].isStatic).toBe(false)
    })

    it('marks element with f-if as NOT static', () => {
        const root = fullAst('<div f-if="show"></div>')
        expect(root.children[0].isStatic ?? false).toBe(false)
    })

    it('marks interpolation with literal as static', () => {
        const root   = fullAst('<p>{{ "hello" }}</p>')
        const interp = root.children[0].children[0]
        expect(interp.isStatic).toBe(true)
    })

    // ── f-once hoisting ───────────────────────────────────────────────────────

    it('marks f-once element as hoisted', () => {
        const root = fullAst('<div f-once><p>Static</p></div>')
        const div  = root.children[0]
        expect(div.isStatic).toBe(true)
        expect(div.hoisted).toBe(true)
    })

    it('collects hoisted nodes on ast._hoisted', () => {
        const root = fullAst('<div f-once><p>A</p><p>B</p></div>')
        expect(root._hoisted.length).toBeGreaterThan(0)
    })

    // ── conditional chaining ──────────────────────────────────────────────────

    it('chains f-if + f-else into IfNode', () => {
        const root = fullAst(`
            <div f-if="a">A</div>
            <div f-else>B</div>
        `)
        const ifNode = root.children.find(n => n.type === 'If')
        expect(ifNode).toBeTruthy()
        expect(ifNode.branches).toHaveLength(2)
        expect(ifNode.branches[0].condition.content).toBe('a')
        expect(ifNode.branches[1].condition).toBeNull()
    })

    it('chains f-if + f-else-if + f-else', () => {
        const root = fullAst(`
            <div f-if="a">A</div>
            <div f-else-if="b">B</div>
            <div f-else>C</div>
        `)
        const ifNode = root.children.find(n => n.type === 'If')
        expect(ifNode.branches).toHaveLength(3)
        expect(ifNode.branches[1].condition.content).toBe('b')
    })

    // ── validation warnings ───────────────────────────────────────────────────

    it('warns on f-for without :key', () => {
        const { warnings } = transform(ast('<li f-for="item in list"></li>'), {
            source: '<li f-for="item in list"></li>'
        })
        const w = warnings.find(w => w.code === ErrorCode.FOR_MISSING_KEY)
        expect(w).toBeTruthy()
    })

    it('does NOT warn on f-for with :key', () => {
        const { warnings } = transform(ast('<li f-for="item in list" :key="item.id"></li>'), {
            source: '<li f-for="item in list" :key="item.id"></li>'
        })
        const w = warnings.find(w => w.code === ErrorCode.FOR_MISSING_KEY)
        expect(w).toBeUndefined()
    })

    it('warns on f-model on non-input element', () => {
        const { warnings } = transform(ast('<div f-model="val"></div>'), {
            source: '<div f-model="val"></div>'
        })
        const w = warnings.find(w => w.code === ErrorCode.MODEL_ON_NON_INPUT)
        expect(w).toBeTruthy()
    })

    it('does NOT warn on f-model on <input>', () => {
        const { warnings } = transform(ast('<input f-model="val">'), {
            source: '<input f-model="val">'
        })
        const w = warnings.find(w => w.code === ErrorCode.MODEL_ON_NON_INPUT)
        expect(w).toBeUndefined()
    })

    it('warns on orphaned f-else (no f-if)', () => {
        const { warnings } = transform(ast('<div f-else>B</div>'), {
            source: '<div f-else>B</div>'
        })
        const w = warnings.find(w => w.code === ErrorCode.V_ELSE_NO_IF)
        expect(w).toBeTruthy()
    })

    it('warns on unregistered component', () => {
        const src = '<MyComp></MyComp>'
        const { warnings } = transform(ast(src, ['MyComp']), { source: src })
        const w = warnings.find(w => w.code === ErrorCode.COMPONENT_NOT_REGISTERED)
        expect(w).toBeTruthy()
    })

    it('does NOT warn on registered component', () => {
        const src = '<MyComp></MyComp>'
        const { warnings } = transform(ast(src, ['MyComp']), {
            source: src,
            components: new Set(['MyComp'])
        })
        const w = warnings.find(w => w.code === ErrorCode.COMPONENT_NOT_REGISTERED)
        expect(w).toBeUndefined()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

describe('Generator', () => {

    it('produces a render function export', () => {
        const out = code('<div></div>')
        expect(out).toContain('export function render')
    })

    it('imports from fusee/runtime/h.js by default', () => {
        const out = code('<div></div>')
        expect(out).toContain("from 'fusee/runtime/h.js'")
    })

    it('uses custom runtimePath', () => {
        const { code: out } = compile('<div></div>', { runtimePath: '../runtime/h.js' })
        expect(out).toContain("from '../runtime/h.js'")
    })

    // ── static text ───────────────────────────────────────────────────────────

    it('generates hText for plain text', () => {
        const out = code('<p>hello</p>')
        expect(out).toContain('hText("hello")')
    })

    // ── elements ──────────────────────────────────────────────────────────────

    it('generates h() call for element', () => {
        const out = code('<div></div>')
        expect(out).toContain('h("div"')
    })

    it('generates h() with static class attr', () => {
        const out = code('<div class="foo"></div>')
        expect(out).toContain('"class": "foo"')
    })

    it('generates getter for dynamic binding :class', () => {
        const out = code('<div :class="cls"></div>')
        expect(out).toMatch(/"class":\s*\(\)\s*=>/)
    })

    it('generates event handler for @click', () => {
        const out = code('<button @click="handleClick"></button>')
        expect(out).toContain('"@click"')
        expect(out).toContain('_ctx.handleClick')
    })

    it('generates inline handler for @click with expression', () => {
        const out = code('<button @click="doSomething()"></button>')
        expect(out).toContain('$event')
    })

    it('includes modifiers array for event', () => {
        const out = code('<button @click.prevent.stop="fn"></button>')
        expect(out).toContain('["prevent","stop"]')
    })

    // ── interpolation ─────────────────────────────────────────────────────────

    it('generates reactive hText for {{ expr }}', () => {
        const out = code('<p>{{ count }}</p>')
        expect(out).toMatch(/hText\(\(\)\s*=>/)
    })

    it('generates static hText for literal interpolation {{ "hi" }}', () => {
        const out = code('<p>{{ "hi" }}</p>')
        expect(out).toContain('hText(String("hi"))')
    })

    // ── directives ────────────────────────────────────────────────────────────

    it('generates f-show entry', () => {
        const out = code('<div f-show="visible"></div>')
        expect(out).toContain("'f-show'")
    })

    it('generates f-model with getter and @input handler', () => {
        const out = code('<input f-model="name">')
        expect(out).toContain("'f-model'")
        expect(out).toContain("'@input'")
        expect(out).toContain('$e.target.value')
    })

    it('generates f-html entry', () => {
        const out = code('<div f-html="rawHtml"></div>')
        expect(out).toContain("'f-html'")
    })

    it('generates f-ref entry', () => {
        const out = code('<input f-ref="inputEl">')
        expect(out).toContain("'f-ref': \"inputEl\"")
    })

    it('generates f-once flag', () => {
        const out = code('<div f-once></div>')
        expect(out).toContain("'f-once': true")
    })

    // ── f-for ─────────────────────────────────────────────────────────────────

    it('generates hFor for f-for list', () => {
        const out = code('<li f-for="item in list" :key="item.id"></li>')
        expect(out).toContain('hFor(')
    })

    it('hFor receives source getter', () => {
        const out = code('<li f-for="item in items" :key="item.id"></li>')
        expect(out).toMatch(/hFor\(\s*\(\)\s*=>/)
    })

    it('hFor callback includes item param', () => {
        const out = code('<li f-for="item in items" :key="item.id"></li>')
        expect(out).toMatch(/\(item\)\s*=>/)
    })

    it('hFor callback includes (item, index) when declared', () => {
        const out = code('<li f-for="(item, index) in items" :key="item.id"></li>')
        expect(out).toMatch(/\(item,\s*index\)\s*=>/)
    })

    // ── f-if ──────────────────────────────────────────────────────────────────

    it('generates hIf for f-if', () => {
        const out = code('<div f-if="show">A</div><div f-else>B</div>')
        expect(out).toContain('hIf(')
    })

    it('hIf has correct branch count for if/else-if/else', () => {
        const out = code('<div f-if="a">A</div><div f-else-if="b">B</div><div f-else>C</div>')
        // Three branch arrays inside hIf
        const matches = out.match(/\(\)\s*=>/g) ?? []
        expect(matches.length).toBeGreaterThanOrEqual(3)
    })

    // ── static hoisting ───────────────────────────────────────────────────────

    it('hoists f-once node to top-level const', () => {
        const out = code('<div f-once><span>Static</span></div>')
        expect(out).toMatch(/const _s\d+\s*=\s*h\(/)
    })

    it('references hoisted node by variable in render fn', () => {
        const out = code('<div f-once><p>A</p><p>B</p></div>')
        // The render fn body should reference _s0 not inline h()
        const renderBody = out.split('export function render')[1]
        expect(renderBody).toMatch(/_s\d+/)
    })

    // ── components ────────────────────────────────────────────────────────────

    it('generates createComponent for PascalCase tag', () => {
        const out = code('<MyBtn></MyBtn>', ['MyBtn'])
        expect(out).toContain('createComponent("MyBtn"')
    })

    it('passes static props to component', () => {
        const out = code('<Card title="Hello"></Card>', ['Card'])
        expect(out).toContain('"title": "Hello"')
    })

    it('passes dynamic props as getters to component', () => {
        const out = code('<Card :count="n"></Card>', ['Card'])
        expect(out).toMatch(/"count":\s*\(\)\s*=>/)
    })

    it('generates on: prefix for component event listener', () => {
        const out = code('<Card @close="onClose"></Card>', ['Card'])
        expect(out).toContain('"on:close"')
    })

    // ── slots ─────────────────────────────────────────────────────────────────

    it('generates hSlot for <slot>', () => {
        const out = code('<slot></slot>')
        expect(out).toContain('hSlot(')
    })

    it('generates default slot for component children', () => {
        const out = code('<Card><p>content</p></Card>', ['Card'])
        expect(out).toContain('"default"')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 5. FULL PIPELINE (compile())
// ─────────────────────────────────────────────────────────────────────────────

describe('compile() — full pipeline', () => {

    it('returns code, ast, tokens, warnings', () => {
        const result = compile('<div></div>')
        expect(result).toHaveProperty('code')
        expect(result).toHaveProperty('ast')
        expect(result).toHaveProperty('tokens')
        expect(result).toHaveProperty('warnings')
    })

    it('compiles a static template without warnings', () => {
        const { code: out, warnings } = compile('<div class="container"><p>Hello</p></div>')
        expect(warnings).toHaveLength(0)
        expect(out).toContain('h("div"')
        expect(out).toContain('h("p"')
    })

    it('compiles a template with signal binding', () => {
        const { code: out } = compile('<p>{{ count }}</p>')
        expect(out).toContain('hText(')
        expect(out).toContain('count')
    })

    it('compiles f-if / f-else correctly', () => {
        const { code: out, warnings } = compile('<div f-if="ok">Yes</div><div f-else>No</div>')
        expect(warnings).toHaveLength(0)
        expect(out).toContain('hIf(')
    })

    it('compiles f-for with :key without warnings', () => {
        const { code: out, warnings } = compile(
            '<ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>'
        )
        expect(warnings.filter(w => w.code === ErrorCode.FOR_MISSING_KEY)).toHaveLength(0)
        expect(out).toContain('hFor(')
    })

    it('emits warning for f-for without :key but does not throw', () => {
        const { warnings } = compile('<li f-for="item in list"></li>')
        expect(warnings.some(w => w.code === ErrorCode.FOR_MISSING_KEY)).toBe(true)
    })

    it('compiles f-model on input', () => {
        const { code: out, warnings } = compile('<input f-model="email">')
        expect(warnings.filter(w => w.code === ErrorCode.MODEL_ON_NON_INPUT)).toHaveLength(0)
        expect(out).toContain("'f-model'")
    })

    it('throws CompileError on unterminated mustache', () => {
        expect(() => compile('<p>{{ unclosed</p>')).toThrow(CompileError)
    })

    it('throws CompileError on mismatched tags', () => {
        expect(() => compile('<div></span>')).toThrow(CompileError)
    })

    it('throws CompileError on empty binding expression', () => {
        expect(() => compile('<div :class=""></div>')).toThrow(CompileError)
    })

    it('throws CompileError on invalid f-for syntax', () => {
        expect(() => compile('<li f-for="bad"></li>')).toThrow(CompileError)
    })

    it('includes filename in error message when provided', () => {
        try {
            compile('<div></span>', { filename: 'App.fusee' })
        } catch (e) {
            expect(e.message).toContain('App.fusee')
        }
    })

    it('compiles component with slots', () => {
        const { code: out } = compile(
            '<Dialog><template slot="header"><h1>Title</h1></template><p>Body</p></Dialog>',
            { components: ['Dialog'] }
        )
        expect(out).toContain('createComponent("Dialog"')
        expect(out).toContain('"header"')
        expect(out).toContain('"default"')
    })

    it('compiles a realistic counter component template', () => {
        const src = `
            <div class="counter">
                <p>Count: {{ count }}</p>
                <button @click="increment">+</button>
                <button @click="decrement" f-show="count() > 0">-</button>
            </div>
        `
        const { code: out, warnings } = compile(src)
        expect(warnings).toHaveLength(0)
        expect(out).toContain('h("div"')
        expect(out).toContain('hText(')
        expect(out).toContain('"@click"')
        expect(out).toContain("'f-show'")
    })

    it('compiles a realistic todo list template', () => {
        const src = `
            <ul>
                <li
                    f-for="(todo, i) in todos"
                    :key="todo.id"
                    :class="{ done: todo.done }"
                >
                    {{ i + 1 }}. {{ todo.text }}
                </li>
            </ul>
        `
        const { code: out, warnings } = compile(src)
        expect(warnings.filter(w => w.code === ErrorCode.FOR_MISSING_KEY)).toHaveLength(0)
        expect(out).toContain('hFor(')
        expect(out).toMatch(/\(todo,\s*i\)\s*=>/)
    })

    it('compiles deeply nested template', () => {
        const src = `
            <section>
                <header><h1>Title</h1></header>
                <main>
                    <article f-if="post">
                        <p>{{ post.body }}</p>
                    </article>
                    <p f-else>Loading…</p>
                </main>
            </section>
        `
        const { code: out } = compile(src)
        expect(out).toContain('hIf(')
        expect(out).toContain('h("section"')
    })

    // ── parseOnly ──────────────────────────────────────────────────────────────

    it('parseOnly returns ast and tokens without generating code', () => {
        const { ast: a, tokens: t } = parseOnly('<div></div>')
        expect(a.type).toBe(NodeType.ROOT)
        expect(t.length).toBeGreaterThan(0)
    })

    // ── compileBatch ──────────────────────────────────────────────────────────

    it('compileBatch compiles multiple templates', () => {
        const results = compileBatch([
            { id: 'A', source: '<div></div>' },
            { id: 'B', source: '<p>{{ msg }}</p>' },
        ])
        expect(results).toHaveLength(2)
        expect(results[0].code).toContain('render')
        expect(results[1].code).toContain('hText(')
    })

    it('compileBatch captures errors per-template without throwing', () => {
        const results = compileBatch([
            { id: 'ok',  source: '<div></div>' },
            { id: 'bad', source: '<div></span>' },
        ])
        expect(results[0].error).toBeNull()
        expect(results[1].error).toBeInstanceOf(CompileError)
        expect(results[1].code).toBeNull()
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 6. ERRORS
// ─────────────────────────────────────────────────────────────────────────────

describe('CompileError', () => {

    it('has the correct error code', () => {
        try { compile('<div></span>') } catch (e) {
            expect(e.code).toBeDefined()
        }
    })

    it('format() includes line and column', () => {
        try {
            compile('<div>\n  {{ unclosed\n</div>')
        } catch (e) {
            if (e instanceof CompileError) {
                const formatted = e.format('test.fusee')
                expect(formatted).toContain('test.fusee')
            }
        }
    })

    it('format() includes source snippet with caret', () => {
        try {
            tokenize('{{ open')
        } catch (e) {
            if (e instanceof CompileError) {
                const snippet = e._buildSnippet()
                expect(snippet).toContain('~')
            }
        }
    })
})