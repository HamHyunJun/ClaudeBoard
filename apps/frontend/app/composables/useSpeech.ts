import type { Ref } from 'vue'

// lib.dom 에 아직 없는 Web Speech API 의 필요한 부분만 선언한다
interface RecognitionResult {
  isFinal: boolean
  [index: number]: { transcript: string }
}
interface RecognitionEvent {
  results: ArrayLike<RecognitionResult>
}
interface Recognition {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: RecognitionEvent) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
  start: () => void
  stop: () => void
}
interface RecognitionCtor {
  new (): Recognition
}

export interface UseSpeech {
  supported: boolean
  listening: Ref<boolean>
  error: Ref<string>
  toggle: () => void
  stop: () => void
}

const SUBMIT = /(?:^|\s)(?:전송|엔터)(?:\s?(?:해\s?줘|해주세요|해))?[.!?]?$/

/** 문장 끝의 "전송"·"엔터"(+해줘)를 전송 명령으로 떼어 낸다. 앞말과 띄어 말해야 하며 "데이터전송" 같은 붙은 말은 그대로 둔다 */
export function splitSubmit(text: string): { text: string; submit: boolean } {
  const m = SUBMIT.exec(text)
  return m ? { text: text.slice(0, m.index).trim(), submit: true } : { text, submit: false }
}

// 다시 시작해도 해결되지 않는 오류
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'audio-capture'])
const RESTART_MS = 300

const ERRORS: Record<string, string> = {
  'not-allowed': '마이크 권한이 필요합니다. 주소창의 사이트 설정에서 허용해 주세요.',
  'service-not-allowed': '마이크 권한이 필요합니다. 주소창의 사이트 설정에서 허용해 주세요.',
  'audio-capture': '마이크를 찾을 수 없습니다.',
  network: '음성 인식 서버에 연결하지 못했습니다.'
}

/**
 * 브라우저 내장 음성 인식(Web Speech API, 한국어)으로 말한 내용을 텍스트로 받는다.
 * 인식 중에는 중간 결과(final=false)가, 한 문장이 끝나면 확정 결과(final=true)가 콜백으로 온다.
 * Chrome 계열은 인식을 위해 음성을 브라우저 제공사 서버로 보내며, Firefox 는 지원하지 않는다.
 */
export function useSpeech(onText: (text: string, final: boolean) => void): UseSpeech {
  const Ctor = import.meta.client
    ? ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition)
    : undefined
  const listening = ref(false)
  const error = ref('')
  let rec: Recognition | undefined
  // 사용자가 끄기 전에는 브라우저가 인식을 끝내도(무음·시간 제한·네트워크) 이어서 다시 시작한다
  let wanted = false
  let restartable = true

  const stop = (): void => {
    wanted = false
    rec?.stop()
    // 재시작 대기 중에는 onend 가 다시 오지 않으므로 여기서 바로 내린다
    listening.value = false
  }

  const start = (): void => {
    if (!Ctor) return
    error.value = ''
    wanted = true
    restartable = true
    rec = new Ctor()
    rec.lang = 'ko-KR'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      // 네트워크 오류 뒤 다시 들리기 시작하면 오류 표시를 지운다
      error.value = ''
      const last = e.results[e.results.length - 1]
      if (last) onText(last[0]?.transcript.trim() ?? '', last.isFinal)
    }
    rec.onerror = (e) => {
      // 말이 없어 끝난 경우는 오류로 보지 않는다
      if (e.error !== 'no-speech' && e.error !== 'aborted') error.value = ERRORS[e.error] ?? `음성 인식 오류: ${e.error}`
      // 권한·마이크 문제는 다시 시작해도 소용없으므로 거기서 멈춘다. 그 밖의 끊김(무음·네트워크·시간 제한)은 계속 이어 듣는다
      if (FATAL.has(e.error)) restartable = false
    }
    rec.onend = () => {
      if (wanted && restartable) {
        // 바로 다시 시작하면 오류가 계속될 때 빠르게 반복되므로 잠시 쉰다
        setTimeout(() => {
          if (!wanted) return
          try {
            rec?.start()
          } catch {
            wanted = false
            listening.value = false
          }
        }, RESTART_MS)
        return
      }
      wanted = false
      listening.value = false
    }
    rec.start()
    listening.value = true
  }

  const toggle = (): void => (listening.value ? stop() : start())

  onBeforeUnmount(stop)
  return { supported: !!Ctor, listening, error, toggle, stop }
}
