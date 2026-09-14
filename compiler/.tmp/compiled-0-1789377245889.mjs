import { escapeHtml, escapeAttr, renderClass, renderStyle, ssrEnumerate, renderComponentSSR, ssrVal } from '../../framework/core/ssr.js'

export async function renderSSR(_ctx, _components) {
    let __html = ''
    __html += '<div'
    __html += ' class="' + escapeAttr("card") + '"'
    __html += '>'
    __html += '<h2'
    __html += '>'
    __html += "Hello, "
    __html += '<!--f-bind:0-->' + escapeHtml(String(ssrVal(_ctx.name))) + '<!--/f-bind:0-->'
    __html += "!"
    __html += '</h2>'
    __html += '</div>'
    return __html
}