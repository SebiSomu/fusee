export declare function fuseeCompilerPlugin(): {
  name: 'vite-plugin-fusee-compiler'
  enforce: 'pre'
  transform(code: string, id: string): { code: string; map: any } | null
}
