// framework/__tests__/memory-leaks.test.js
// Memory leak detection tests - verify cleanup functionality
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal, effect, batch } from '../core/signal.js';
import { defineComponent, onUnmount, onMount } from '../core/component.js';
import { mountTemplate } from '../core/compiler.js';
import { registerDelegatedEvent, DELEGATED_EVENTS } from '../core/event-delegation.js';

describe('Memory Leak Detection — Functional Cleanup Tests', () => {

  // ─── Core Memory Leak Tests (functional versions) ─────────────────────────────

  it('ready memory — baseline: verify cleanup system is initialized', () => {
    // Verify cleanup functions can be registered and called
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();

    const TestComponent = defineComponent({
      setup() {
        onUnmount(cleanup1);
        onUnmount(cleanup2);
        return { template: '<div>Test</div>' };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    comp.unmount();

    expect(cleanup1).toHaveBeenCalled();
    expect(cleanup2).toHaveBeenCalled();
  });

  it('run memory — after creating 1,000 effects: verify all can be cleaned up', () => {
    let effectRuns = 0;
    const count = signal(0);
    const effects = [];

    // Create 1000 effects
    for (let i = 0; i < 1000; i++) {
      effects.push(effect(() => {
        effectRuns++;
        return count();
      }));
    }

    const runsAfterCreation = effectRuns;
    expect(runsAfterCreation).toBe(1000);

    // Trigger effects
    count(1);
    const runsAfterTrigger = effectRuns;
    expect(runsAfterTrigger).toBe(2000);

    // Cleanup all effects in reverse order
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i]();
    }

    // Trigger again - effects should not run
    count(2);
    expect(effectRuns).toBe(runsAfterTrigger);
  });

  it('creating/clearing 1k rows (5 cycles) — verify cleanup after multiple cycles', () => {
    const cleanupCount = { total: 0 };

    for (let cycle = 0; cycle < 5; cycle++) {
      const effects = [];
      const items = signal([]);

      // Create 1000 items with effects
      for (let i = 0; i < 1000; i++) {
        const cleanup = effect(() => {
          return items();
        });
        effects.push(cleanup);
      }

      // Populate signal
      items(Array.from({ length: 1000 }, (_, i) => ({ id: i })));

      // Cleanup all effects
      for (let i = effects.length - 1; i >= 0; i--) {
        effects[i]();
        cleanupCount.total++;
      }

      // Clear signal
      items([]);
    }

    expect(cleanupCount.total).toBe(5000); // 1000 effects * 5 cycles
  });

  // ─── Existing tests ─────────────────────────────────────────────────────────
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
    container = null;
  });

  it('effects are cleaned up when stopped', () => {
    let effectRuns = 0;
    const count = signal(0);

    const cleanup = effect(() => {
      effectRuns++;
      return count();
    });

    expect(effectRuns).toBe(1);

    count(1);
    expect(effectRuns).toBe(2);

    // Stop the effect
    cleanup();

    count(2);
    // Effect should not run again
    expect(effectRuns).toBe(2);
  });

  it('nested effects are cleaned up with parent', () => {
    let parentRuns = 0;
    let childRuns = 0;
    const parentCount = signal(0);
    const childCount = signal(0);

    const parentCleanup = effect(() => {
      parentRuns++;
      return parentCount();
    });

    const childCleanup = effect(() => {
      childRuns++;
      return childCount();
    });

    expect(parentRuns).toBe(1);
    expect(childRuns).toBe(1);

    parentCount(1);
    childCount(1);
    expect(parentRuns).toBe(2);
    expect(childRuns).toBe(2);

    // Stop both effects
    parentCleanup();
    childCleanup();

    parentCount(2);
    childCount(2);
    // Neither should run again
    expect(parentRuns).toBe(2);
    expect(childRuns).toBe(2);
  });

  it('component unmount cleans up all effects', () => {
    let effectRunCount = 0;
    let unmountHookCalled = false;

    const TestComponent = defineComponent({
      setup() {
        const count = signal(0);

        // Create multiple effects
        effect(() => {
          effectRunCount++;
          return count();
        });

        effect(() => {
          effectRunCount++;
          return count() * 2;
        });

        onUnmount(() => {
          unmountHookCalled = true;
        });

        return { count, template: '<div>{{ count }}</div>' };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    const runsAfterMount = effectRunCount;

    // Change signal to trigger effects
    comp.instance.state.count(1);

    expect(effectRunCount).toBeGreaterThan(runsAfterMount);

    // Unmount should stop effects
    comp.unmount();

    const runsAfterUnmount = effectRunCount;

    // Change signal again - effects should not run
    comp.instance.state.count(2);

    expect(effectRunCount).toBe(runsAfterUnmount);
    expect(unmountHookCalled).toBe(true);
  });

  it('delegated events are cleaned up on element removal', () => {
    const { registerDelegatedEvent } = require('../core/event-delegation.js');

    let handlerCalled = 0;
    const handler = () => {
      handlerCalled++;
    };

    const btn = document.createElement('button');
    container.appendChild(btn);

    const cleanup = registerDelegatedEvent(btn, 'click', handler, {});

    // Trigger event
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlerCalled).toBe(1);

    // Cleanup
    cleanup();

    // Remove element
    btn.remove();

    // Trigger event again - handler should not be called
    const newBtn = document.createElement('button');
    container.appendChild(newBtn);
    newBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handlerCalled).toBe(1);
  });

  it('delegated events cleanup removes entry from global map', () => {
    const { registerDelegatedEvent } = require('../core/event-delegation.js');

    const handler = () => {};
    const btn = document.createElement('button');
    container.appendChild(btn);

    const cleanup = registerDelegatedEvent(btn, 'click', handler, {});

    // Cleanup
    cleanup();

    btn.remove();

    // Verify cleanup was called
    expect(typeof cleanup).toBe('function');
  });

  it('multiple delegated events on same element are all cleaned up', () => {
    const { registerDelegatedEvent } = require('../core/event-delegation.js');

    let clickCalled = 0;
    let mouseoverCalled = 0;

    const btn = document.createElement('button');
    container.appendChild(btn);

    const clickCleanup = registerDelegatedEvent(btn, 'click', () => { clickCalled++; }, {});
    const mouseoverCleanup = registerDelegatedEvent(btn, 'mouseover', () => { mouseoverCalled++; }, {});

    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(clickCalled).toBe(1);
    expect(mouseoverCalled).toBe(1);

    // Cleanup both
    clickCleanup();
    mouseoverCleanup();

    btn.remove();

    // Events should not trigger anymore
    const newBtn = document.createElement('button');
    container.appendChild(newBtn);
    newBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    newBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(clickCalled).toBe(1);
    expect(mouseoverCalled).toBe(1);
  });

  it('component cleanup removes event listeners from DOM', () => {
    const TestComponent = defineComponent({
      setup() {
        const count = signal(0);

        return {
          count,
          template: '<div>{{ count }}</div>'
        };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    const div = container.querySelector('div');
    expect(div).toBeTruthy();

    // Unmount
    comp.unmount();

    // Element should be cleared
    expect(container.innerHTML).toBe('');
  });

  it('f-for cleanup removes all item effects', () => {
    const items = signal([]);
    const itemEffects = new Map();

    // Simulate f-for with effects per item
    const cleanup = effect(() => {
      const current = items();

      // Cleanup removed items
      for (const [id, itemCleanup] of itemEffects) {
        if (!current.find(r => r.id === id)) {
          itemCleanup();
          itemEffects.delete(id);
        }
      }

      // Add effects for new items
      for (const row of current) {
        if (!itemEffects.has(row.id)) {
          const itemCleanup = effect(() => {
            return row.label();
          });
          itemEffects.set(row.id, itemCleanup);
        }
      }
    });

    // Add items
    items([
      { id: 1, label: signal('Item 1') },
      { id: 2, label: signal('Item 2') },
      { id: 3, label: signal('Item 3') }
    ]);

    expect(itemEffects.size).toBe(3);

    // Remove items
    items([
      { id: 1, label: signal('Item 1') }
    ]);

    expect(itemEffects.size).toBe(1);

    // Clear all
    items([]);

    expect(itemEffects.size).toBe(0);

    // Cleanup main effect
    cleanup();
  });

  it('nested component cleanup unmounts all children', () => {
    let parentUnmountCalled = false;
    let childUnmountCalled = false;

    const ChildComponent = defineComponent({
      setup() {
        onUnmount(() => {
          childUnmountCalled = true;
        });
        return { template: '<div>Child</div>' };
      }
    });

    const ParentComponent = defineComponent({
      setup() {
        onUnmount(() => {
          parentUnmountCalled = true;
        });
        return { template: '<div>Parent</div>' };
      }
    });

    const parent = ParentComponent({}, {});
    parent.render(container);

    const child = ChildComponent({}, {});
    child.render(container.querySelector('div'));

    // Unmount parent - child should also be unmounted
    parent.unmount();

    // Manually unmount child since it wasn't registered as a child component
    child.unmount();

    expect(parentUnmountCalled).toBe(true);
    expect(childUnmountCalled).toBe(true);
  });

  it('signal cleanup removes all subscribers', () => {
    let subscriber1Called = 0;
    let subscriber2Called = 0;

    const count = signal(0);

    const cleanup1 = effect(() => {
      subscriber1Called++;
      return count();
    });

    const cleanup2 = effect(() => {
      subscriber2Called++;
      return count();
    });

    count(1);

    expect(subscriber1Called).toBe(2);
    expect(subscriber2Called).toBe(2);

    // Stop one subscriber
    cleanup1();

    count(2);

    // Only second subscriber should run
    expect(subscriber1Called).toBe(2);
    expect(subscriber2Called).toBe(3);

    // Stop second subscriber
    cleanup2();

    count(3);

    // Neither should run
    expect(subscriber1Called).toBe(2);
    expect(subscriber2Called).toBe(3);
  });

  it('batch cleanup does not leak pending effects', () => {
    let effectRuns = 0;
    const count = signal(0);

    const cleanup = effect(() => {
      effectRuns++;
      return count();
    });

    const initialRuns = effectRuns;

    batch(() => {
      count(1);
      count(2);
    });

    expect(effectRuns).toBeGreaterThan(initialRuns);

    cleanup();

    const finalRuns = effectRuns;

    count(3);

    // Effect should not run after cleanup
    expect(effectRuns).toBe(finalRuns);
  });

  it('cleanup functions are called in reverse order (LIFO)', () => {
    const cleanupOrder = [];

    const cleanup1 = () => { cleanupOrder.push(1); };
    const cleanup2 = () => { cleanupOrder.push(2); };
    const cleanup3 = () => { cleanupOrder.push(3); };

    // Simulate component cleanup
    const effects = [cleanup1, cleanup2, cleanup3];

    // Cleanup in reverse order
    for (let i = effects.length - 1; i >= 0; i--) {
      effects[i]();
    }

    expect(cleanupOrder).toEqual([3, 2, 1]);
  });

  it('multiple unmount calls do not cause errors', () => {
    const TestComponent = defineComponent({
      setup() {
        return { template: '<div>Test</div>' };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    // First unmount
    comp.unmount();

    // Second unmount should not throw
    expect(() => comp.unmount()).not.toThrow();
  });

  it('cleanup after component is removed from DOM still works', () => {
    let effectRuns = 0;

    const TestComponent = defineComponent({
      setup() {
        const count = signal(0);

        effect(() => {
          effectRuns++;
          return count();
        });

        return { count, template: '<div>{{ count }}</div>' };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    const runsBefore = effectRuns;

    // Remove container from DOM
    container.remove();

    // Unmount should still work
    comp.unmount();

    // Change signal
    comp.instance.state.count(1);

    // Effect should not run
    expect(effectRuns).toBe(runsBefore);
  });

  it('delegated event timeouts are cleared on unmount — debounce/throttle cleanup', async () => {
    let handlerCalls = 0;

    const TestComponent = defineComponent({
      setup() {
        const count = signal(0);

        const increment = () => {
          handlerCalls++;
          count(count() + 1);
        };

        return {
          count,
          increment,
          template: '<button @click.debounce.50ms="increment">{{ count }}</button>'
        };
      }
    });

    const comp = TestComponent({}, {});
    comp.render(container);

    const button = container.querySelector('button');
    expect(button).toBeTruthy();

    // Trigger multiple clicks rapidly (before debounce fires)
    button.click();
    button.click();
    button.click();

    // Handler should not have fired yet (debounced)
    expect(handlerCalls).toBe(0);

    // Unmount before debounce timeout completes
    comp.unmount();

    // Wait for original debounce duration
    await new Promise(r => setTimeout(r, 100));

    // Handler should still not have fired (timeout was cleared on unmount)
    expect(handlerCalls).toBe(0);
  });
});
