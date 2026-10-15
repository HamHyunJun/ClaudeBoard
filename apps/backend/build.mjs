// 백엔드 번들: 워크스페이스 공유 패키지(@claudeboard/shared)는 번들에 포함하고
// 네이티브 모듈(node-pty)과 나머지 npm 의존성은 외부로 남긴다.
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const external = Object.keys(pkg.dependencies).filter((d) => d !== '@claudeboard/shared')

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  sourcemap: true,
  external,
  logLevel: 'info'
})
