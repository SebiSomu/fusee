export { }
declare global {
  const batch: typeof import('fusee-framework').batch
  const computed: typeof import('fusee-framework').computed
  const defineComponent: typeof import('fusee-framework').defineComponent
  const effect: typeof import('fusee-framework').effect
  const mountOutlet: typeof import('fusee-framework').mountOutlet
  const onMount: typeof import('fusee-framework').onMount
  const onUnmount: typeof import('fusee-framework').onUnmount
  const signal: typeof import('fusee-framework').signal
  const untrack: typeof import('fusee-framework').untrack
}
