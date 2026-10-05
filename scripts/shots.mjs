import puppeteer from 'puppeteer-core'
import { mkdirSync } from 'node:fs'

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const OUT = 'shots'
mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--no-sandbox'],
  defaultViewport: { width: 1600, height: 900 },
})
const page = await browser.newPage()
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message))
page.on('console', (m) => {
  if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text())
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function goTab(label) {
  await page.$$eval(
    'button',
    (btns, label) => btns.find((b) => b.textContent.includes(label))?.click(),
    label,
  )
  await sleep(1600) // lazy 3D + mesh
}

async function pickPreset(id) {
  const ok = await page.$$eval(
    'select',
    (sels, id) => {
      const s = sels[0]
      if (!s) return 'no-select'
      const opt = [...s.options].find((o) => o.value === id)
      if (!opt) return 'no-option'
      s.value = id
      s.dispatchEvent(new Event('change', { bubbles: true }))
      return 'ok'
    },
    id,
  )
  if (ok !== 'ok') console.log(`  preset ${id}: ${ok}`)
  await sleep(900)
}

async function toggleSurf() {
  await page.$$eval('label', (labels) => {
    const l = [...labels].find((el) => el.textContent.includes('superficie completa'))
    l?.querySelector('input')?.click()
  })
  await sleep(1200)
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` })

await page.goto(process.env.SHOTS_URL ?? 'http://localhost:5173', { waitUntil: 'networkidle0' })
await sleep(1000)

// Módulo 1
await shot('m1-default')
await pickPreset('m1-tp13-2')
await shot('m1-tp13-2')

// Módulo 2
await goTab('Cambio de variables')
await shot('m2-corona')
await pickPreset('m2-hiperbolas')
await shot('m2-hiperbolas')

// Módulo 3
await goTab('03')
await shot('m3-parab-plano')
await pickPreset('m3-tetra-4b')
await shot('m3-tetra-4b')
await pickPreset('m3-tp14-8d')
await shot('m3-tp14-8d')
await pickPreset('m3-tp14-6a')
await shot('m3-tp14-6a')
await pickPreset('m3-tp14-4c')
await toggleSurf()
await shot('m3-tp14-4c-superficies')
await toggleSurf()

// Módulo 4
await goTab('Cilíndricas')
await shot('m4-helado-sph')
await pickPreset('m4-tp16-9')
await shot('m4-tp16-9')
await pickPreset('m4-tp16-8')
await shot('m4-tp16-8')

await browser.close()
console.log('done')
