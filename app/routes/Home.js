import { defineComponent, signal } from '../../framework/index.js'
import { Counter } from '../components/Counter.js'

export const Home = defineComponent({
  props: [],
  components: { Counter },
  setup() {
    const title = signal('Welcome!')

    return {
      title,
      template: `
        <div class="page">
          <h1>{{ title }}</h1>
          <p>This is an SPA built with my own JavaScript custom framework!</p>
          <p>Made with passion by Sebastian Șomu</p>
          {{ Counter }}
        </div>
      `
    }
  }
})
