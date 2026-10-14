export class AudioEngine {
    readonly element: HTMLAudioElement
    private context: AudioContext | null = null
    private analyser: AnalyserNode | null = null
    private objectUrl: string | null = null
  
    constructor() {
      this.element = new Audio()
      this.element.preload = 'metadata'
    }
  
    // AudioContext 必须在用户操作之后创建，所以延迟到第一次 play
    private ensureContext(): AudioContext {
      if (this.context) return this.context
  
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
  
      const context = new Ctor()
      const analyser = context.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.8
  
      // 同一个 <audio> 元素只能创建一次 source
      const source = context.createMediaElementSource(this.element)
      source.connect(analyser)
      analyser.connect(context.destination)
  
      this.context = context
      this.analyser = analyser
      return context
    }
  
    load(file: File): void {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.objectUrl = URL.createObjectURL(file)
      this.element.src = this.objectUrl
      this.element.load()
    }
  
    async play(): Promise<void> {
      const context = this.ensureContext()
      if (context.state === 'suspended') await context.resume()
      await this.element.play()
    }
  
    pause(): void {
      this.element.pause()
    }
  
    seek(seconds: number): void {
      this.element.currentTime = seconds
    }

    
    getAnalyser(): AnalyserNode | null {
      return this.analyser
    }
  
    dispose(): void {
      this.element.pause()
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      void this.context?.close()
    }
  }