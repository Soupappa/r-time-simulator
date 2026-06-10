export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private stream: MediaStream | null = null

  start(canvas: HTMLCanvasElement, fps = 30): boolean {
    if (!canvas.captureStream) {
      alert('captureStream not supported in this browser.')
      return false
    }
    this.chunks = []
    this.stream = canvas.captureStream(fps)
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: 'video/webm;codecs=vp9',
    })
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data)
    }
    this.mediaRecorder.start()
    return true
  }

  stop(): Promise<Blob> {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) return
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' })
        resolve(blob)
      }
      this.mediaRecorder.stop()
      this.stream?.getTracks().forEach((t) => t.stop())
    })
  }

  download(blob: Blob, filename = 'r-time-simulation.webm') {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }
}
