import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { getPayload } from 'payload'
import config from '@payload-config'

const WIDTH = 1200
const HEIGHT = 630

const ACCENTS: Record<string, string> = {
  linux: '#f2c94c',
  raspberry: '#e74c3c',
  domoticz: '#3498db',
  network: '#2ecc71',
  system: '#9b59b6',
}

const ICONS: Record<string, string> = {
  terminal:
    '<polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>',
  cloud:
    '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  database:
    '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  monitor:
    '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/>',
  cpu: '<rect x="4" y="4" width="16" height="16" rx="2"/><rect x="9" y="9" width="6" height="6"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  hardDrive:
    '<line x1="22" x2="2" y1="12" y2="12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><line x1="6" x2="6.01" y1="16" y2="16"/><line x1="10" x2="10.01" y1="16" y2="16"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  fileText:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  settings:
    '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  printer:
    '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
  thermometer:
    '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  radio: '<circle cx="12" cy="12" r="2"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/>',
  activity: '<path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"/>',
  arrowRightLeft:
    '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
}

type ThumbSpec = {
  wp: number
  icon: keyof typeof ICONS
  alt: string
}

// Accent per CATEGORY (not per post) — visual system consistency:
// linux=yellow, raspberry=red, domoticz/home-assistant=blue, network=green, system=purple
const CATEGORY_ACCENTS: Record<string, keyof typeof ACCENTS> = {
  linux: 'linux',
  raspberry: 'raspberry',
  domoticz: 'domoticz',
  'home-assistant': 'domoticz',
  python: 'raspberry',
  'mikr-us': 'network',
}

const POST_CATEGORIES: Record<number, string[]> = {
  34: ['raspberry', 'python'],
  41: ['linux', 'raspberry', 'mikr-us'],
  79: ['linux', 'raspberry'],
  101: ['raspberry'],
  148: ['raspberry'],
  158: ['linux'],
  172: ['linux'],
  174: ['linux', 'raspberry'],
  202: ['linux', 'raspberry', 'mikr-us'],
  204: ['domoticz'],
  206: ['raspberry', 'python'],
  208: ['domoticz'],
  256: ['linux'],
  267: ['home-assistant', 'raspberry'],
  313: ['linux'],
  391: ['raspberry'],
  421: ['linux'],
  477: ['linux'],
  484: ['linux'],
  487: ['linux'],
  495: ['linux'],
  509: ['linux', 'home-assistant'],
}

const resolveAccent = (wp: number): keyof typeof ACCENTS => {
  const categories = POST_CATEGORIES[wp] ?? []
  for (const slug of categories) {
    const accent = CATEGORY_ACCENTS[slug]
    if (accent) return accent
  }
  return 'system'
}

const SPECS: ThumbSpec[] = [
  { wp: 34, icon: 'terminal', alt: 'Jupyter Notebook — ikona terminala' },
  { wp: 41, icon: 'cloud', alt: 'Montowanie dysków WebDAV — ikona chmury' },
  { wp: 79, icon: 'database', alt: 'Dostęp do MySQL/MariaDB — ikona bazy danych' },
  { wp: 101, icon: 'monitor', alt: 'Serwer multimedialny MiniDLNA — ikona ekranu' },
  { wp: 148, icon: 'cpu', alt: '.NET na Raspberry Pi — ikona procesora' },
  { wp: 158, icon: 'search', alt: 'Wyszukiwanie plików — ikona lupy' },
  { wp: 172, icon: 'hardDrive', alt: 'Sprawdzenie systemu plików — ikona dysku' },
  { wp: 174, icon: 'database', alt: 'Serwer MySQL/MariaDB — ikona bazy danych' },
  { wp: 202, icon: 'shield', alt: 'Serwer OpenVPN — ikona tarczy' },
  { wp: 204, icon: 'thermometer', alt: 'Integracja z czujnikiem temperatury — ikona termometru' },
  { wp: 206, icon: 'activity', alt: 'Internet watchdog — ikona pulsacji' },
  { wp: 208, icon: 'printer', alt: 'Integracja z drukarką — ikona drukarki' },
  { wp: 256, icon: 'key', alt: 'Hasła użytkowników — ikona klucza' },
  { wp: 267, icon: 'home', alt: 'Home Assistant — ikona domu' },
  { wp: 313, icon: 'users', alt: 'Użytkownicy i grupy — ikona użytkowników' },
  { wp: 391, icon: 'radio', alt: 'Flashowanie CC2531 — ikona radia' },
  { wp: 421, icon: 'arrowRightLeft', alt: 'Kopiowanie plików przez SSH — ikona transferu' },
  { wp: 477, icon: 'fileText', alt: 'Wyświetlanie logów — ikona dokumentu' },
  { wp: 484, icon: 'settings', alt: 'Dodawanie usługi systemd — ikona koła zębatego' },
  { wp: 487, icon: 'settings', alt: 'Zarządzanie usługami systemd — ikona koła zębatego' },
  { wp: 495, icon: 'lock', alt: 'Uprawnienia chmod — ikona kłódki' },
  { wp: 509, icon: 'zap', alt: 'Flashowanie CC2652P — ikona błyskawicy' },
]

const buildSvg = (spec: ThumbSpec): string => {
  const accent = ACCENTS[resolveAccent(spec.wp)]
  const icon = ICONS[spec.icon]

  return `<svg width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#10141f"/>
      <stop offset="1" stop-color="#1a2135"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="${accent}" stop-opacity="0.22"/>
      <stop offset="1" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="${WIDTH / 2}" cy="${HEIGHT / 2}" r="330" fill="url(#glow)"/>
  <g transform="translate(${WIDTH / 2 - 96}, ${HEIGHT / 2 - 96}) scale(8)" fill="none" stroke="${accent}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    ${icon}
  </g>
  <rect x="0" y="${HEIGHT - 14}" width="${WIDTH}" height="14" fill="${accent}" opacity="0.85"/>
</svg>`
}

async function main() {
  const only = process.argv[2]
  const specs = only
    ? SPECS.filter((s) => String(s.wp) === only)
    : SPECS

  if (specs.length === 0) {
    throw new Error(`no spec for ${only}`)
  }

  const payload = await getPayload({ config })

  for (const spec of specs) {
    const svg = buildSvg(spec)
    const png = await sharp(Buffer.from(svg))
      .png()
      .toBuffer()

    const result = await payload.find({
      collection: 'posts',
      limit: 1,
      where: {
        and: [
          { 'legacy.wordpressId': { equals: spec.wp } },
          { _status: { equals: 'published' } },
        ],
      },
    })

    const post = result.docs[0]
    if (!post) throw new Error(`wp:${spec.wp} not found`)

    const media = await payload.create({
      collection: 'media',
      data: { alt: spec.alt },
      file: {
        data: png,
        mimetype: 'image/png',
        name: `hero-wp-${spec.wp}.png`,
        size: png.byteLength,
      },
    })

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: { heroImage: media.id },
    })

    console.log(
      `wp:${spec.wp} hero -> media:${media.id} (${png.byteLength} bytes)`,
    )
  }

  console.log(`heroes set: ${specs.length}`)
  await payload.db.destroy?.()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
