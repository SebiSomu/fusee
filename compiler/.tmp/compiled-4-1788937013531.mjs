import { escapeHtml, escapeAttr, renderClass, renderStyle, ssrEnumerate, renderComponentSSR, ssrVal } from '../../framework/core/ssr.js'

export async function renderSSR(_ctx, _components) {
    let __html = ''
    __html += '<p'
    __html += '>'
    __html += '<!--f-bind:0-->' + escapeHtml(String(ssrVal(_ctx.count))) + '<!--/f-bind:0-->'
    __html += '</p>'
    return __html
}