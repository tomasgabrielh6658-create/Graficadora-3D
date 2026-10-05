import puppeteer from 'puppeteer-core'
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
  defaultViewport: { width: 390, height: 844, isMobile: true, hasTouch: true },
})
const page = await browser.newPage()
await page.goto('http://localhost:5173', { waitUntil: 'networkidle0' })
await new Promise((r) => setTimeout(r, 2000))
await page.screenshot({ path: 'C:/Users/palac/AppData/Local/Temp/devin-shots/mob-m1.png' })
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
await new Promise((r) => setTimeout(r, 300))
await page.screenshot({ path: 'C:/Users/palac/AppData/Local/Temp/devin-shots/mob-m1-bottom.png' })
for (const n of ['02', '03', '04']) {
  await page.$$eval('button', (bs, n) => bs.find((b) => b.textContent.trim().startsWith(n))?.click(), n)
  await new Promise((r) => setTimeout(r, 3500))
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: `C:/Users/palac/AppData/Local/Temp/devin-shots/mob-m${n}.png` })
  await page.evaluate(() => { const el = document.scrollingElement; el.scrollTop = el.scrollHeight })
  await new Promise((r) => setTimeout(r, 300))
  await page.screenshot({ path: `C:/Users/palac/AppData/Local/Temp/devin-shots/mob-m${n}-bottom.png` })
}
// dimensiones y elementos que desbordan
const info = await page.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const wide = [...document.querySelectorAll('*')]
    .filter((el) => el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0 && el.getBoundingClientRect().width > vw * 0.5)
    .slice(0, 20)
    .map((el) => `${el.tagName}.${[...el.classList].join('.').slice(0, 60)} sw=${el.scrollWidth} cw=${el.clientWidth}`)
  return { vw, docW: document.documentElement.scrollWidth, wide }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
console.log('done')
