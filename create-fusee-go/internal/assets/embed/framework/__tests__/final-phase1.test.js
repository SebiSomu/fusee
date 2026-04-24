// stress.test.js
import { describe, it, expect, vi } from 'vitest'
import { signal, effect, batch } from '../core/signal.js'
import { defineComponent, provide, inject } from '../core/component.js'

describe('Fusée Stress & Edge Cases', () => {

    it('Dependency Injection: Shadowing', () => {
        // Testăm dacă un copil poate suprascrie (shadow) o valoare de la bunic
        const Grandparent = defineComponent({
            setup() { provide('key', 'GP'); return { template: '...' } }
        })
        const Parent = defineComponent({
            setup() { provide('key', 'P'); return { template: '...' } }
        })
        const Child = defineComponent({
            setup() { return { val: inject('key'), template: '...' } }
        })

        const gp = Grandparent().instance
        const p = Parent({}, { parent: gp }).instance
        const cApi = Child({}, { parent: p })
        
        expect(cApi.instance.state.val).toBe('P') // Ar trebui să ia valoarea de la sursa cea mai apropiată
    })

    it('Reactive Array Modification: splice stress', () => {
        const list = signal([1, 2, 3, 4, 5])
        let lastLength = 0
        effect(() => { lastLength = list().length })

        list.splice(1, 2, 10, 11, 12) // Sterge 2, adaugă 3 -> lungime devine 6
        expect(list()).toEqual([1, 10, 11, 12, 4, 5])
        expect(lastLength).toBe(6)
    })
})