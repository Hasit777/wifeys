// ─── Cat face → emoji cropper ──────────────────────────────────────────────
// Runs entirely in the browser using OpenCV.js (loaded lazily, only when a
// cat photo actually needs processing) plus a pretrained Haar cascade for
// cat faces. Detects the face, crops tight around it, masks it into a
// circle, and returns a small base64 PNG that can be used exactly like an
// emoji in chat.
//
// If detection fails for any reason (no face found, model fails to load,
// etc.) it falls back to a plain centre-square crop of the photo, so a cat
// photo will always end up with *some* usable emoji version.

let cvReadyPromise = null
let cascadePromise = null

const OPENCV_SRC = 'https://docs.opencv.org/4.9.0/opencv.js'
const CASCADE_URL = 'https://cdn.jsdelivr.net/gh/opencv/opencv@4.9.0/data/haarcascades/haarcascade_frontalcatface_extended.xml'
const CASCADE_FILE = 'haarcascade_frontalcatface_extended.xml'

function loadOpenCv() {
  if (cvReadyPromise) return cvReadyPromise
  cvReadyPromise = new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) { resolve(window.cv); return }
    const existing = document.querySelector(`script[src="${OPENCV_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => waitForRuntime(resolve))
      existing.addEventListener('error', () => reject(new Error('Failed to load OpenCV')))
      return
    }
    const script = document.createElement('script')
    script.src = OPENCV_SRC
    script.async = true
    script.onload = () => waitForRuntime(resolve)
    script.onerror = () => reject(new Error('Failed to load OpenCV'))
    document.head.appendChild(script)
  })
  return cvReadyPromise

  function waitForRuntime(resolve) {
    const cv = window.cv
    if (cv.Mat) { resolve(cv); return }
    cv['onRuntimeInitialized'] = () => resolve(cv)
  }
}

async function loadCascade(cv) {
  if (cascadePromise) return cascadePromise
  cascadePromise = (async () => {
    const res = await fetch(CASCADE_URL)
    const buf = await res.arrayBuffer()
    cv.FS_createDataFile('/', CASCADE_FILE, new Uint8Array(buf), true, false, false)
    const classifier = new cv.CascadeClassifier()
    classifier.load(CASCADE_FILE)
    return classifier
  })()
  return cascadePromise
}

function loadImage(base64) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = base64
  })
}

/**
 * Crop the cat's face out of a photo and return it as a small, circular,
 * emoji-sized base64 PNG.
 * @param {string} photoBase64 - source photo (data URL)
 * @param {number} size - output width/height in px
 */
export async function cropCatFaceEmoji(photoBase64, size = 160) {
  try {
    const cv = await loadOpenCv()
    const classifier = await loadCascade(cv)
    const img = await loadImage(photoBase64)

    const srcCanvas = document.createElement('canvas')
    srcCanvas.width = img.width
    srcCanvas.height = img.height
    srcCanvas.getContext('2d').drawImage(img, 0, 0)

    const src = cv.imread(srcCanvas)
    const gray = new cv.Mat()
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.equalizeHist(gray, gray)

    const faces = new cv.RectVector()
    const minSize = new cv.Size(Math.max(40, Math.round(img.width * 0.12)), Math.max(40, Math.round(img.height * 0.12)))
    classifier.detectMultiScale(gray, faces, 1.08, 3, 0, minSize)

    let box
    if (faces.size() > 0) {
      let best = faces.get(0)
      for (let i = 1; i < faces.size(); i++) {
        const f = faces.get(i)
        if (f.width * f.height > best.width * best.height) best = f
      }
      // pad outwards a bit so ears/chin aren't clipped
      const padX = Math.round(best.width * 0.22)
      const padY = Math.round(best.height * 0.28)
      const x = Math.max(0, best.x - padX)
      const y = Math.max(0, best.y - padY)
      const w = Math.min(img.width - x, best.width + padX * 2)
      const h = Math.min(img.height - y, best.height + padY * 2)
      // keep it square for a clean circular crop
      const side = Math.min(Math.max(w, h), Math.min(img.width, img.height))
      box = {
        x: Math.min(Math.max(0, x - (side - w) / 2), img.width - side),
        y: Math.min(Math.max(0, y - (side - h) / 2), img.height - side),
        w: side,
        h: side,
      }
    } else {
      const s = Math.min(img.width, img.height)
      box = { x: (img.width - s) / 2, y: (img.height - s) / 2, w: s, h: s }
    }

    src.delete()
    gray.delete()
    faces.delete()

    const out = document.createElement('canvas')
    out.width = size
    out.height = size
    const ctx = out.getContext('2d')
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(srcCanvas, box.x, box.y, box.w, box.h, 0, 0, size, size)
    ctx.restore()

    return out.toDataURL('image/png')
  } catch (e) {
    console.error('[catFace] crop failed, falling back to a centre crop', e)
    return centreCropFallback(photoBase64, size)
  }
}

async function centreCropFallback(photoBase64, size) {
  try {
    const img = await loadImage(photoBase64)
    const s = Math.min(img.width, img.height)
    const x = (img.width - s) / 2
    const y = (img.height - s) / 2
    const out = document.createElement('canvas')
    out.width = size
    out.height = size
    const ctx = out.getContext('2d')
    ctx.save()
    ctx.beginPath()
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
    ctx.closePath()
    ctx.clip()
    ctx.drawImage(img, x, y, s, s, 0, 0, size, size)
    ctx.restore()
    return out.toDataURL('image/png')
  } catch (e) {
    console.error('[catFace] fallback crop also failed, using original photo', e)
    return photoBase64
  }
}
