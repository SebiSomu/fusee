import { escapeHtml, escapeAttr, renderClass, renderStyle, ssrEnumerate, renderComponentSSR, ssrVal } from '../../framework/core/ssr.js'

export async function renderSSR(_ctx, _components) {
    let __html = ''
    __html += '<ul'
    __html += '>'
    __html += '<!--f-for:0-->'
    for (const [item] of ssrEnumerate(ssrVal(_ctx.items))) {
        const __key0 = item.id
        __html += '<!--f-for-item:0:' + escapeAttr(String(__key0)) + '-->'
        __html += '<li'
        __html += (function(v){ if (v === false || v == null) return ''; if (v === true) return ' key'; return ' key="' + escapeAttr(String(v)) + '"' })(item.id)
        __html += ' data-f-id="1"'
        __html += '>'
        __html += '<!--f-bind:2-->' + escapeHtml(String(item.name)) + '<!--/f-bind:2-->'
        __html += '</li>'
        __html += '<!--/f-for-item:0-->'
    }
    __html += '<!--/f-for:0-->'
    __html += '</ul>'
    return __html
}