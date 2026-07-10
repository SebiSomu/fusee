import { describe, it, expect, vi, beforeEach } from 'vitest'

import { tokenize, TokenType } from '../core/compiler/lexer.js'
import { parse } from '../core/compiler/parser.js'
import { transform } from '../core/compiler/transformer.js'
import { generate } from '../core/compiler/generator.js'
import { compile, parseOnly, compileBatch, fuseePlugin } from '../core/compiler/main-compiler.js'
import { CompileError } from '../core/compiler/errors.js'
import { ErrorCode } from '../core/compiler/errors-list.js'
import { NodeType } from '../core/compiler/ast.js'

import {
    compileFileRoutes,
    generateRoutesModule,
    validateRoutes as validateFileRoutes,
    generateRouteTypes,
} from '../core/compiler/plugins/file-router-plugin.js'

import {
    validateActions,
    generateClientStubs,
    generateServerRoutes,
    generateActionTypes,
} from '../core/compiler/plugins/actions-plugin.js'

import {
    validateRoutes,
    generateRouterTypes,
} from '../core/compiler/plugins/router-plugin.js'

// ─── helpers ──────────────────────────────────────────────────────────────────

function ast(src, comps = []) {
    const toks = tokenize(src)
    return parse(toks, src, new Set(comps))
}

function transformWithScope(src, scope = [], comps = []) {
    return transform(ast(src, comps), {
        source: src,
        components: new Set(comps),
        scope,
    })
}

function hasWarning(warnings, code) {
    return warnings.some(w => w.code === code)
}

// helpers

function lex(src) {
    return tokenize(src)
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

    it('generates template for plain text', () => {
        const out = code('<p>hello</p>')
        expect(out).toContain('_template(`<p>hello</p>`)')
        expect(out).toContain('cloneNode(true)')
    })

    // ── elements ──────────────────────────────────────────────────────────────

    it('generates _template for element', () => {
        const out = code('<div></div>')
        expect(out).toContain('_template(`<div></div>`)')
    })

    it('generates template with static class attr', () => {
        const out = code('<div class="foo"></div>')
        expect(out).toContain('_template(`<div class="foo"></div>`)')
    })

    it('generates getter/effect for dynamic binding :class', () => {
        const out = code('<div :class="cls"></div>')
        expect(out).toContain('_setClass(')
        expect(out).toContain('_effect(() => _setClass(')
    })

    it('generates event handler for @click', () => {
        const out = code('<button @click="handleClick"></button>')
        expect(out).toContain('_on(')
        expect(out).toContain('_ctx.handleClick')
    })

    it('generates inline handler for @click with expression', () => {
        const out = code('<button @click="doSomething()"></button>')
        expect(out).toContain('_on(')
        expect(out).toContain('$event')
    })

    it('includes modifiers array for event', () => {
        const out = code('<button @click.prevent.stop="fn"></button>')
        expect(out).toContain('["prevent","stop"]')
    })

    // ── interpolation ─────────────────────────────────────────────────────────

    it('generates reactive _insert for {{ expr }}', () => {
        const out = code('<p>{{ count }}</p>')
        expect(out).toContain('_insert(')
        expect(out).toContain('() =>')
    })

    it('generates static _insert for literal interpolation {{ "hi" }}', () => {
        const out = code('<p>{{ "hi" }}</p>')
        expect(out).toContain('_insert(')
        expect(out).toContain('String(')
    })

    // ── directives ────────────────────────────────────────────────────────────

    it('generates f-show entry', () => {
        const out = code('<div f-show="visible"></div>')
        expect(out).toContain('.style.display =')
    })

    it('generates f-model with getter and @input handler', () => {
        const out = code('<input f-model="name">')
        expect(out).toContain('.value = String(')
        expect(out).toContain('"input"')
        expect(out).toContain('$e.target.value')
    })

    it('generates f-html entry', () => {
        const out = code('<div f-html="rawHtml"></div>')
        expect(out).toContain('.innerHTML = String(')
    })

    it('generates f-ref entry', () => {
        const out = code('<input f-ref="inputEl">')
        expect(out).toContain("CustomEvent('fusee:ref'")
        expect(out).toContain('"inputEl"')
    })

    it('generates f-once template without effects', () => {
        const out = code('<div f-once></div>')
        expect(out).not.toContain('_effect')
    })

    // ── f-for ─────────────────────────────────────────────────────────────────

    it('generates _hFor for f-for list', () => {
        const out = code('<li f-for="item in list" :key="item.id"></li>')
        expect(out).toContain('_hFor(')
    })

    it('_hFor receives source getter', () => {
        const out = code('<li f-for="item in items" :key="item.id"></li>')
        expect(out).toMatch(/_hFor\(\(\)\s*=>/)
    })

    it('_hFor callback includes item param', () => {
        const out = code('<li f-for="item in items" :key="item.id"></li>')
        expect(out).toMatch(/\(item\)\s*=>/)
    })

    it('_hFor callback includes (item, index) when declared', () => {
        const out = code('<li f-for="(item, index) in items" :key="item.id"></li>')
        expect(out).toMatch(/\(item,\s*index\)\s*=>/)
    })

    // ── f-if ──────────────────────────────────────────────────────────────────

    it('generates _hIf for f-if', () => {
        const out = code('<div f-if="show">A</div><div f-else>B</div>')
        expect(out).toContain('_hIf(')
    })

    it('_hIf has correct branch count for if/else-if/else', () => {
        const out = code('<div f-if="a">A</div><div f-else-if="b">B</div><div f-else>C</div>')
        const matches = out.match(/\(\)\s*=>/g) ?? []
        expect(matches.length).toBeGreaterThanOrEqual(3)
    })

    // ── static hoisting ───────────────────────────────────────────────────────

    it('hoists f-once template', () => {
        const out = code('<div f-once><span>Static</span></div>')
        expect(out).toContain('_template(')
    })

    it('references template clone in render fn', () => {
        const out = code('<div f-once><p>A</p><p>B</p></div>')
        const renderBody = out.split('export function render')[1]
        expect(renderBody).toContain('cloneNode(true)')
    })

    // ── components ────────────────────────────────────────────────────────────

    it('generates _createComponent for PascalCase tag', () => {
        const out = code('<MyBtn></MyBtn>', ['MyBtn'])
        expect(out).toContain('_createComponent("MyBtn"')
    })

    it('passes static props to component', () => {
        const out = code('<Card title="Hello"></Card>', ['Card'])
        expect(out).toContain('"title": "Hello"')
    })

    it('passes dynamic props as getters to component', () => {
        const out = code('<Card :count="n"></Card>', ['Card'])
        expect(out).toContain('get "count"')
    })

    it('passes event listener in listeners option to component', () => {
        const out = code('<Card @close="onClose"></Card>', ['Card'])
        expect(out).toContain('"close":')
    })

    // ── slots ─────────────────────────────────────────────────────────────────

    it('generates _hSlot for <slot>', () => {
        const out = code('<slot></slot>')
        expect(out).toContain('_hSlot(')
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
        expect(out).toContain('_template(')
        expect(out).toContain('cloneNode(true)')
    })

    it('compiles a template with signal binding', () => {
        const { code: out } = compile('<p>{{ count }}</p>')
        expect(out).toContain('_insert(')
        expect(out).toContain('count')
    })

    it('compiles f-if / f-else correctly', () => {
        const { code: out, warnings } = compile('<div f-if="ok">Yes</div><div f-else>No</div>')
        expect(warnings).toHaveLength(0)
        expect(out).toContain('_hIf(')
    })

    it('compiles f-for with :key without warnings', () => {
        const { code: out, warnings } = compile(
            '<ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>'
        )
        expect(warnings.filter(w => w.code === ErrorCode.FOR_MISSING_KEY)).toHaveLength(0)
        expect(out).toContain('_hFor(')
    })

    it('emits warning for f-for without :key but does not throw', () => {
        const { warnings } = compile('<li f-for="item in list"></li>')
        expect(warnings.some(w => w.code === ErrorCode.FOR_MISSING_KEY)).toBe(true)
    })

    it('compiles f-model on input', () => {
        const { code: out, warnings } = compile('<input f-model="email">')
        expect(warnings.filter(w => w.code === ErrorCode.MODEL_ON_NON_INPUT)).toHaveLength(0)
        expect(out).toContain('input')
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
        expect(out).toContain('_template(')
        expect(out).toContain('_insert(')
        expect(out).toContain('_on(')
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
        expect(out).toContain('_hFor(')
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
        expect(out).toContain('_hIf(')
        expect(out).toContain('_template(')
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
        expect(results[1].code).toContain('_insert(')
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

describe('Transformer — semantic analysis', () => {

    // ── scope opt-in ──────────────────────────────────────────────────────────

    it('skips semantic analysis when no scope provided', () => {
        const src = '<div :class="nonExistent"></div>'
        const { warnings } = transform(ast(src), { source: src })
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('runs semantic analysis when scope is provided', () => {
        const src = '<div :class="nonExistent"></div>'
        const { warnings } = transformWithScope(src, ['cls'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    // ── known identifiers ─────────────────────────────────────────────────────

    it('does NOT warn on identifier present in scope', () => {
        const src = '<div :class="cls"></div>'
        const { warnings } = transformWithScope(src, ['cls'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('does NOT warn on JS globals (Math, console, etc.)', () => {
        const src = '<p>{{ Math.max(a, b) }}</p>'
        const { warnings } = transformWithScope(src, ['a', 'b'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('does NOT warn on JS keywords (typeof, null, true, etc.)', () => {
        const src = '<div f-if="typeof val !== undefined"></div>'
        const { warnings } = transformWithScope(src, ['val'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('does NOT warn on string literal content mistaken as identifier', () => {
        const src = '<p>{{ "hello world" }}</p>'
        const { warnings } = transformWithScope(src, [])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('does NOT warn on RHS of member access (obj.prop — only obj is checked)', () => {
        const src = '<p>{{ user.name }}</p>'
        const { warnings } = transformWithScope(src, ['user'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    // ── unknown identifiers ───────────────────────────────────────────────────

    it('warns on unknown identifier in interpolation', () => {
        const src = '<p>{{ typoCount }}</p>'
        const { warnings } = transformWithScope(src, ['count'])
        const w = warnings.find(w => w.code === ErrorCode.UNKNOWN_IDENTIFIER)
        expect(w).toBeTruthy()
        expect(w.message).toContain('typoCount')
    })

    it('warns on unknown identifier in :binding', () => {
        const src = '<div :class="isActve"></div>'
        const { warnings } = transformWithScope(src, ['isActive'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    it('warns on unknown identifier in @event expression', () => {
        const src = '<button @click="handlClick"></button>'
        const { warnings } = transformWithScope(src, ['handleClick'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    it('warns on unknown identifier in f-if', () => {
        const src = '<div f-if="isVisibl"></div>'
        const { warnings } = transformWithScope(src, ['isVisible'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    it('warns on unknown identifier in f-show', () => {
        const src = '<div f-show="visibl"></div>'
        const { warnings } = transformWithScope(src, ['visible'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    // ── f-for scope extension ─────────────────────────────────────────────────

    it('does NOT warn on f-for item variable used in children', () => {
        const src = '<li f-for="item in items" :key="item.id">{{ item.name }}</li>'
        const { warnings } = transformWithScope(src, ['items'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('does NOT warn on f-for index variable used in children', () => {
        const src = '<li f-for="(item, index) in items" :key="item.id">{{ index }}</li>'
        const { warnings } = transformWithScope(src, ['items'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    it('f-for item is NOT available outside the loop', () => {
        const src = `
            <ul><li f-for="item in items" :key="item.id">{{ item.name }}</li></ul>
            <p>{{ item.name }}</p>
        `
        const { warnings } = transformWithScope(src, ['items'])
        const unknowns = warnings.filter(w => w.code === ErrorCode.UNKNOWN_IDENTIFIER)
        expect(unknowns.some(w => w.message.includes('item'))).toBe(true)
    })

    it('nested f-for each has independent scope', () => {
        const src = `
            <div f-for="group in groups" :key="group.id">
                <span f-for="item in group.items" :key="item.id">{{ item.name }}</span>
            </div>
        `
        const { warnings } = transformWithScope(src, ['groups'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    // ── $event ────────────────────────────────────────────────────────────────

    it('does NOT warn on $event in event handler expression', () => {
        const src = '<input @input="handleInput($event)">'
        const { warnings } = transformWithScope(src, ['handleInput', '$event'])
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })

    // ── static :key in f-for ──────────────────────────────────────────────────

    it('warns on static literal :key in f-for (S002)', () => {
        const src = '<li f-for="item in items" :key="1">{{ item }}</li>'
        const root = ast(src)
        // Mark the key expression as _isForKey manually (generator does this)
        const li    = root.children[0]
        const keyB  = li.props.find(p => p.type === NodeType.BINDING && p.name === 'key')
        if (keyB) keyB.expression._isForKey = true
        const { warnings } = transform(root, { source: src, scope: ['items'] })
        expect(hasWarning(warnings, ErrorCode.STATIC_FOR_KEY)).toBe(true)
    })

    // ── compile() integration with scope ──────────────────────────────────────

    it('compile() passes scope to transformer', () => {
        const src = '<div :class="typo"></div>'
        const { warnings } = compile(src, { scope: ['cls'] })
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(true)
    })

    it('compile() with correct scope produces no UNKNOWN_IDENTIFIER', () => {
        const src = '<div :class="cls">{{ msg }}</div>'
        const { warnings } = compile(src, { scope: ['cls', 'msg'] })
        expect(hasWarning(warnings, ErrorCode.UNKNOWN_IDENTIFIER)).toBe(false)
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 8. FILE ROUTER PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

describe('fileRouterPlugin — compileFileRoutes()', () => {

    it('returns empty array for no files', () => {
        const routes = compileFileRoutes([], { pagesDir: 'src/pages' })
        expect(routes).toEqual([])
    })

    it('generates index route from index.js', () => {
        const routes = compileFileRoutes(['src/pages/index.js'], { pagesDir: 'src/pages' })
        expect(routes.some(r => r.path === '/')).toBe(true)
    })

    it('generates named route from about.js', () => {
        const routes = compileFileRoutes(['src/pages/about.js'], { pagesDir: 'src/pages' })
        expect(routes.some(r => r.path === '/about')).toBe(true)
    })

    it('generates dynamic route from [id].js', () => {
        const routes = compileFileRoutes(['src/pages/users/[id].js'], { pagesDir: 'src/pages' })
        const userRoute = routes.find(r => r.path === '/users' || r.children)
        expect(JSON.stringify(routes)).toContain(':id')
    })

    it('generates catch-all route from [...slug].js', () => {
        const routes = compileFileRoutes(['src/pages/[...slug].js'], { pagesDir: 'src/pages' })
        expect(JSON.stringify(routes)).toContain('*')
    })

    it('generates nested routes from subdirectory', () => {
        const files = [
            'src/pages/index.js',
            'src/pages/users/index.js',
            'src/pages/users/[id].js',
        ]
        const routes = compileFileRoutes(files, { pagesDir: 'src/pages' })
        expect(JSON.stringify(routes)).toContain('users')
    })

    it('sorts static routes before dynamic routes', () => {
        const files = [
            'src/pages/users/[id].js',
            'src/pages/users/profile.js',
        ]
        const routes = compileFileRoutes(files, { pagesDir: 'src/pages' })
        const flat = JSON.stringify(routes)
        expect(flat.indexOf('profile')).toBeLessThan(flat.indexOf(':id'))
    })

    it('sorts wildcard * last', () => {
        const files = [
            'src/pages/[...404].js',
            'src/pages/about.js',
        ]
        const routes = compileFileRoutes(files, { pagesDir: 'src/pages' })
        const paths = routes.map(r => r.path)
        expect(paths.indexOf('/about')).toBeLessThan(paths.indexOf('*'))
    })

    it('creates layout route with children from _layout.js', () => {
        const files = [
            'src/pages/_layout.js',
            'src/pages/index.js',
            'src/pages/about.js',
        ]
        const routes = compileFileRoutes(files, { pagesDir: 'src/pages' })
        expect(routes.length).toBe(1)
        expect(routes[0].children).toBeDefined()
        expect(routes[0].children.length).toBeGreaterThan(0)
    })
})

describe('fileRouterPlugin — generateRoutesModule()', () => {

    it('produces valid JS with import statements', () => {
        const routes = compileFileRoutes(['src/pages/index.js'], { pagesDir: 'src/pages' })
        const mod = generateRoutesModule(routes, 'src/pages')
        expect(mod).toContain('import(')
        expect(mod).toContain('export const routes')
    })

    it('includes all page file paths as dynamic imports', () => {
        const files = ['src/pages/index.js', 'src/pages/about.js']
        const routes = compileFileRoutes(files, { pagesDir: 'src/pages' })
        const mod = generateRoutesModule(routes, 'src/pages')
        expect(mod).toContain('index.js')
        expect(mod).toContain('about.js')
    })

    it('exports default routes', () => {
        const routes = compileFileRoutes(['src/pages/index.js'], { pagesDir: 'src/pages' })
        const mod = generateRoutesModule(routes, 'src/pages')
        expect(mod).toContain('export default routes')
    })

    it('does not contain runtime file-router.js import', () => {
        const routes = compileFileRoutes(['src/pages/index.js'], { pagesDir: 'src/pages' })
        const mod = generateRoutesModule(routes, 'src/pages')
        expect(mod).not.toContain('generateRoutes')
    })
})

describe('fileRouterPlugin — validateRoutes()', () => {

    it('returns no errors for valid routes', () => {
        const routes = [
            { path: '/' },
            { path: '/about' },
            { path: '/users/:id' },
        ]
        const { errors, warnings } = validateFileRoutes(routes)
        expect(errors).toHaveLength(0)
    })

    it('errors on duplicate static paths', () => {
        const routes = [
            { path: '/about' },
            { path: '/about' },
        ]
        const { errors } = validateFileRoutes(routes)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toContain('/about')
    })

    it('warns on conflicting dynamic segments at same level', () => {
        const routes = [
            { path: ':id' },
            { path: ':userId' },
        ]
        const { warnings } = validateFileRoutes(routes)
        expect(warnings.length).toBeGreaterThan(0)
    })

    it('warns on layout with no children', () => {
        const routes = [
            { path: '/admin', children: [] },
        ]
        const { warnings } = validateFileRoutes(routes)
        expect(warnings.some(w => w.includes('no child'))).toBe(true)
    })
})

describe('fileRouterPlugin — generateRouteTypes()', () => {

    it('generates AppRoute type union', () => {
        const routes = compileFileRoutes(['src/pages/index.js', 'src/pages/about.js'], { pagesDir: 'src/pages' })
        const types = generateRouteTypes(routes)
        expect(types).toContain('export type AppRoute')
        expect(types).toContain('"/"')
        expect(types).toContain('"/about"')
    })

    it('generates RouteParams for dynamic segments', () => {
        const routes = compileFileRoutes(['src/pages/users/[id].js'], { pagesDir: 'src/pages' })
        const types = generateRouteTypes(routes)
        expect(types).toContain('RouteParams')
        expect(types).toContain('id: string')
    })

    it('generates ParamsFor<T> helper', () => {
        const routes = compileFileRoutes(['src/pages/index.js'], { pagesDir: 'src/pages' })
        const types = generateRouteTypes(routes)
        expect(types).toContain('ParamsFor')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 9. ACTIONS PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

describe('actionsPlugin — validateActions()', () => {

    it('returns no errors when all client actions exist on server', () => {
        const server = [{ name: 'saveUser', exportName: 'saveUser' }]
        const client = ['saveUser']
        const { errors } = validateActions(server, client)
        expect(errors).toHaveLength(0)
    })

    it('errors on client action with no server counterpart', () => {
        const server = [{ name: 'saveUser', exportName: 'saveUser' }]
        const client = ['saveUser', 'deleteUser']
        const { errors } = validateActions(server, client)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toContain('deleteUser')
    })

    it('warns on server action unused by client', () => {
        const server = [
            { name: 'saveUser', exportName: 'saveUser' },
            { name: 'archiveUser', exportName: 'archiveUser' },
        ]
        const client = ['saveUser']
        const { warnings } = validateActions(server, client)
        expect(warnings.some(w => w.includes('archiveUser'))).toBe(true)
    })

    it('returns no warnings when client list is empty (no client file)', () => {
        const server = [{ name: 'saveUser', exportName: 'saveUser' }]
        const client = []
        const { warnings, errors } = validateActions(server, client)
        expect(errors).toHaveLength(0)
        expect(warnings).toHaveLength(0)
    })

    it('handles multiple actions correctly', () => {
        const server = ['getPost', 'savePost', 'deletePost'].map(n => ({ name: n, exportName: n }))
        const client = ['getPost', 'savePost', 'deletePost']
        const { errors, warnings } = validateActions(server, client)
        expect(errors).toHaveLength(0)
        expect(warnings).toHaveLength(0)
    })
})

describe('actionsPlugin — generateClientStubs()', () => {

    const actions = [
        { name: 'saveUser', exportName: 'saveUser' },
        { name: 'getPost', exportName: 'getPost' },
    ]

    it('generates createActionProxy for each action', () => {
        const out = generateClientStubs(actions)
        expect(out).toContain('createActionProxy("saveUser"')
        expect(out).toContain('createActionProxy("getPost"')
    })

    it('exports each action by name', () => {
        const out = generateClientStubs(actions)
        expect(out).toContain('export const saveUser')
        expect(out).toContain('export const getPost')
    })

    it('re-exports useAction', () => {
        const out = generateClientStubs(actions)
        expect(out).toContain('export { useAction }')
    })

    it('uses custom baseUrl when provided', () => {
        const out = generateClientStubs(actions, { baseUrl: '/api/actions' })
        expect(out).toContain('/api/actions')
    })

    it('does not contain defineAction — zero boilerplate', () => {
        const out = generateClientStubs(actions)
        expect(out).not.toContain('defineAction')
    })
})

describe('actionsPlugin — generateServerRoutes()', () => {

    const actions = [
        { name: 'saveUser', exportName: 'saveUser' },
        { name: 'getPost', exportName: 'getPost' },
    ]

    it('generates actionHandlers map', () => {
        const out = generateServerRoutes(actions)
        expect(out).toContain('actionHandlers')
        expect(out).toContain('"saveUser"')
        expect(out).toContain('"getPost"')
    })

    it('generates mountActionRoutes for Express', () => {
        const out = generateServerRoutes(actions)
        expect(out).toContain('mountActionRoutes')
        expect(out).toContain('app.post(')
    })

    it('generates dispatchAction for fetch API', () => {
        const out = generateServerRoutes(actions)
        expect(out).toContain('dispatchAction')
        expect(out).toContain('new URL(request.url)')
    })

    it('uses custom baseUrl', () => {
        const out = generateServerRoutes(actions, { baseUrl: '/api/actions' })
        expect(out).toContain('/api/actions')
    })
})

describe('actionsPlugin — generateActionTypes()', () => {

    const actions = [
        { name: 'saveUser', exportName: 'saveUser' },
        { name: 'getPost', exportName: 'getPost' },
    ]

    it('generates ActionName union type', () => {
        const out = generateActionTypes(actions)
        expect(out).toContain('export type ActionName')
        expect(out).toContain('"saveUser"')
        expect(out).toContain('"getPost"')
    })

    it('generates ActionProxy type', () => {
        const out = generateActionTypes(actions)
        expect(out).toContain('ActionProxy')
    })

    it('generates UseActionResult type', () => {
        const out = generateActionTypes(actions)
        expect(out).toContain('UseActionResult')
        expect(out).toContain('pending')
        expect(out).toContain('execute')
    })

    it('declares each action as ActionProxy', () => {
        const out = generateActionTypes(actions)
        expect(out).toContain('export declare const saveUser: ActionProxy')
        expect(out).toContain('export declare const getPost: ActionProxy')
    })

    it('handles empty actions list', () => {
        const out = generateActionTypes([])
        expect(out).toContain('ActionName = never')
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 10. ROUTER PLUGIN
// ─────────────────────────────────────────────────────────────────────────────

describe('routerPlugin — validateRoutes()', () => {

    it('passes valid flat route tree', () => {
        const routes = [
            { path: '/' },
            { path: '/about' },
            { path: '/contact' },
        ]
        const { errors, warnings } = validateRoutes(routes)
        expect(errors).toHaveLength(0)
        expect(warnings).toHaveLength(0)
    })

    it('errors on duplicate path at same level', () => {
        const routes = [
            { path: '/about' },
            { path: '/about' },
        ]
        const { errors } = validateRoutes(routes)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toContain('/about')
    })

    it('errors on route defined after wildcard *', () => {
        const routes = [
            { path: '*' },
            { path: '/unreachable' },
        ]
        const { errors } = validateRoutes(routes)
        expect(errors.length).toBeGreaterThan(0)
        expect(errors[0]).toContain('unreachable')
    })

    it('errors on duplicate wildcard *', () => {
        const routes = [
            { path: '*' },
            { path: '*' },
        ]
        const { errors } = validateRoutes(routes)
        expect(errors.length).toBeGreaterThan(0)
    })

    it('warns on conflicting dynamic segments at same level', () => {
        const routes = [
            { path: ':id' },
            { path: ':userId' },
        ]
        const { warnings } = validateRoutes(routes)
        expect(warnings.some(w => w.includes('id') && w.includes('userId'))).toBe(true)
    })

    it('warns on layout with empty children array', () => {
        const routes = [
            { path: '/dashboard', children: [] },
        ]
        const { warnings } = validateRoutes(routes)
        expect(warnings.some(w => w.includes('no child'))).toBe(true)
    })

    it('validates nested children recursively', () => {
        const routes = [
            {
                path: '/admin',
                children: [
                    { path: 'users' },
                    { path: 'users' },
                ]
            }
        ]
        const { errors } = validateRoutes(routes)
        expect(errors.length).toBeGreaterThan(0)
    })

    it('allows same path at different nesting levels', () => {
        const routes = [
            { path: '/users', children: [{ path: 'profile' }] },
            { path: '/settings', children: [{ path: 'profile' }] },
        ]
        const { errors } = validateRoutes(routes)
        expect(errors).toHaveLength(0)
    })
})

describe('routerPlugin — generateRouterTypes()', () => {

    it('generates AppRoute union with all paths', () => {
        const routes = [
            { path: '/' },
            { path: '/about' },
            { path: '/users/:id' },
        ]
        const types = generateRouterTypes(routes)
        expect(types).toContain('export type AppRoute')
        expect(types).toContain('"/"')
        expect(types).toContain('"/about"')
        expect(types).toContain('"/users/:id"')
    })

    it('generates RouteParams with dynamic segment types', () => {
        const routes = [{ path: '/users/:id' }]
        const types = generateRouterTypes(routes)
        expect(types).toContain('RouteParams')
        expect(types).toContain('id: string')
    })

    it('generates multiple params for deeply dynamic routes', () => {
        const routes = [{ path: '/users/:userId/posts/:postId' }]
        const types = generateRouterTypes(routes)
        expect(types).toContain('userId: string')
        expect(types).toContain('postId: string')
    })

    it('generates ParamsFor<T> helper type', () => {
        const routes = [{ path: '/users/:id' }]
        const types = generateRouterTypes(routes)
        expect(types).toContain('ParamsFor<T extends AppRoute>')
    })

    it('generates typed navigate() declaration', () => {
        const routes = [{ path: '/' }]
        const types = generateRouterTypes(routes)
        expect(types).toContain('declare function navigate(path: AppRoute)')
    })

    it('generates useRouteParams() declaration', () => {
        const routes = [{ path: '/' }]
        const types = generateRouterTypes(routes)
        expect(types).toContain('useRouteParams')
    })

    it('handles nested routes recursively', () => {
        const routes = [
            {
                path: '/admin',
                children: [
                    { path: 'users' },
                    { path: 'settings' },
                ]
            }
        ]
        const types = generateRouterTypes(routes)
        expect(types).toContain('/admin')
        expect(types).toContain('users')
        expect(types).toContain('settings')
    })

    it('generates AppRoute = "/" fallback for empty routes', () => {
        const types = generateRouterTypes([])
        expect(types).toContain("'/'")
    })
})

// ─────────────────────────────────────────────────────────────────────────────
// 11. fuseePlugin (Vite plugin)
// ─────────────────────────────────────────────────────────────────────────────

describe('fuseePlugin — Vite transform plugin', () => {

    function makePlugin(opts = {}) {
        return fuseePlugin(opts)
    }

    it('has correct plugin name', () => {
        const plugin = makePlugin()
        expect(plugin.name).toBe('vite-plugin-fusee')
    })

    it('has a transform hook', () => {
        const plugin = makePlugin()
        expect(typeof plugin.transform).toBe('function')
    })

    it('returns null for non-.fusee files', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<div></div>', 'App.vue')
        expect(result).toBeNull()
    })

    it('returns null for .js files', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<div></div>', 'main.js')
        expect(result).toBeNull()
    })

    it('compiles .fusee files and returns code + map', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<div class="app"></div>', 'App.fusee')
        expect(result).not.toBeNull()
        expect(result.code).toContain('export function render')
        expect(result.map).toBeNull()
    })

    it('compiles .fhtml files', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<p>{{ msg }}</p>', 'template.fhtml')
        expect(result).not.toBeNull()
        expect(result.code).toContain('_insert(')
    })

    it('calls this.warn() for each compiler warning', () => {
        const plugin = makePlugin()
        const warnFn = vi.fn()
        const ctx    = { warn: warnFn }
        plugin.transform.call(ctx, '<li f-for="item in list"></li>', 'List.fusee')
        expect(warnFn).toHaveBeenCalled()
        expect(warnFn.mock.calls[0][0]).toContain('T002')
    })

    it('uses custom runtimePath in generated code', () => {
        const plugin = makePlugin({ runtimePath: '../runtime/h.js' })
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<div></div>', 'App.fusee')
        expect(result.code).toContain("from '../runtime/h.js'")
    })

    it('passes scope option to transformer', () => {
        const plugin = makePlugin({ scope: ['count'] })
        const warnFn = vi.fn()
        const ctx    = { warn: warnFn }
        plugin.transform.call(ctx, '<p>{{ typo }}</p>', 'App.fusee')
        expect(warnFn).toHaveBeenCalled()
        const msg = warnFn.mock.calls[0][0]
        expect(msg).toContain('S001')
    })

    it('passes components option to parser', () => {
        const plugin = makePlugin({ components: ['MyBtn'] })
        const ctx    = { warn: vi.fn() }
        const result = plugin.transform.call(ctx, '<MyBtn></MyBtn>', 'App.fusee')
        expect(result.code).toContain('createComponent("MyBtn"')
    })

    it('does not throw on valid template', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        expect(() =>
            plugin.transform.call(ctx, '<div class="ok"><p>{{ msg }}</p></div>', 'App.fusee')
        ).not.toThrow()
    })

    it('throws CompileError on invalid template (mismatched tag)', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        expect(() =>
            plugin.transform.call(ctx, '<div></span>', 'Broken.fusee')
        ).toThrow(CompileError)
    })

    it('error message contains filename when transform throws', () => {
        const plugin = makePlugin()
        const ctx    = { warn: vi.fn() }
        try {
            plugin.transform.call(ctx, '<div></span>', 'MyComponent.fusee')
        } catch (e) {
            expect(e.message).toContain('MyComponent.fusee')
        }
    })
})