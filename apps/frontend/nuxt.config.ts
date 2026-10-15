// ClaudeBoard 프론트엔드: 로컬 관제 도구라 SSR 없이 SPA 로 빌드하고 백엔드가 정적 파일을 서빙한다.
export default defineNuxtConfig({
  compatibilityDate: '2025-10-01',
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/styles/main.scss'],
  app: {
    head: {
      htmlAttrs: { lang: 'ko' },
      title: 'ClaudeBoard',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '로컬 Claude Code 세션을 한 화면에서 모니터링하고 제어하는 관제 대시보드' },
        { name: 'color-scheme', content: 'dark light' }
      ],
      // 첫 페인트 전에 테마를 정해 밝은 테마에서 어두운 화면이 번쩍이는 것을 막는다
      script: [
        {
          innerHTML:
            "try{var t=localStorage.getItem('claudeboard-theme');document.documentElement.dataset.theme=t==='light'||t==='dark'?t:matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}catch(e){}"
        }
      ],
      link: [
        { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,300..800&family=JetBrains+Mono:wght@400;500;600&display=swap'
        }
      ]
    }
  },
  runtimeConfig: {
    public: {
      /** 비어 있으면 현재 페이지와 같은 origin(백엔드가 서빙하는 경우)을 쓴다 */
      backendOrigin: ''
    }
  },
  vite: {
    // 모든 SFC <style lang="scss"> 에서 믹스인·브레이크포인트를 바로 쓸 수 있게 주입
    css: { preprocessorOptions: { scss: { additionalData: '@use "~/assets/styles/tokens" as *;\n' } } },
    optimizeDeps: { include: ['@xterm/xterm', '@xterm/addon-fit', '@xterm/addon-web-links'] }
  },
  typescript: { strict: true }
})
