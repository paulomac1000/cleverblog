import { getPayload } from 'payload'
import config from '@payload-config'

type Fix = {
  wp: number
  find: string
  replace: string
  note: string
}

const FIXES: Fix[] = [
  {
    wp: 148,
    find: '<pre><code>wget https://packages.microsoft.com/config/raspbian/10/packages-microsoft-prod.deb\nsudo dpkg -i packages-microsoft-prod.deb</code></pre>',
    replace: '<pre><code>wget https://packages.microsoft.com/config/raspbian/10/packages-microsoft-prod.deb\nsudo dpkg -i packages-microsoft-prod.deb\nsudo apt-get update</code></pre>',
    note: 'add missing apt-get update after adding the Microsoft repo',
  },
  {
    wp: 495,
    find: 'Jedną z najważniejszych z nich jest chmod, która umożliwia zarządzanie uprawnieniami',
    replace: 'Jednym z najważniejszych z nich jest polecenie chmod, które umożliwia zarządzanie uprawnieniami',
    note: 'chmod is a command, not a "function"',
  },
  {
    wp: 495,
    find: 'Funkcja <em>chmod</em> pozwala',
    replace: 'Polecenie <em>chmod</em> pozwala',
    note: 'same fix, second occurrence',
  },
  {
    wp: 267,
    find: 'użyjemy parametry <code>-rm</code>, ktory doda',
    replace: 'użyjemy parametrów <code>-rm</code>, który doda',
    note: 'typo: parametry/ktory -> parametrów/który',
  },
  {
    wp: 41,
    find: '<p>Automatyczne montowanie przez /etc/fstab:</p>',
    replace: '<p>Montowanie na żądanie przez wpis w /etc/fstab (opcja <code>noauto</code> — montowanie nastąpi po wykonaniu <code>mount /mnt/webdav</code>, nie przy starcie systemu):</p>',
    note: 'fstab entry uses noauto; original text claimed automatic mounting',
  },
  {
    wp: 206,
    find: 'który restartuje router lub interfejs sieciowy w razie utraty połączenia',
    replace: 'który restartuje Raspberry Pi w razie utraty połączenia',
    note: 'script does sudo reboot; intro promised router/interface restart',
  },
  {
    wp: 202,
    find: '<p>Uruchomienie klienta:</p>',
    replace: '<p>Uruchomienie klienta (po przeniesieniu konfiguracji do <code>/etc/openvpn/client.conf</code> — wygenerowany plik <code>.ovpn</code> nie zostanie automatycznie rozpoznany jako profil systemowej usługi):</p>',
    note: 'openvpn@client expects client.conf, not the generated .ovpn',
  },
  {
    wp: 509,
    find: '<pre><code>sudo apt-get install python3-serial</code></pre>',
    replace: '<pre><code>sudo apt-get install python3-serial\nsudo pip3 install intelhex</code></pre>',
    note: 'IntelHex dependency required for .hex firmware files',
  },
  {
    wp: 509,
    find: '<pre><code>python3 cc2538-bsl/cc2538-bsl.py -p /dev/ttyUSB0 --verify</code></pre>',
    replace: '<pre><code>python3 cc2538-bsl/cc2538-bsl.py -p /dev/ttyUSB0 -v firmware.hex</code></pre>',
    note: 'verify requires the firmware file argument',
  },
  {
    wp: 204,
    find: '<pre><code>sudo apt-get install bluez hcitool</code></pre>',
    replace: '<pre><code>sudo apt-get install bluez</code></pre>',
    note: 'hcitool ships inside bluez, not a separate package',
  },
  {
    wp: 204,
    find: 'następnie dodaj go w Domoticz jako urządzenie BLE (hardware type: Xiaomi Mi).',
    replace: 'następnie dodaj go w Domoticz — czujniki Xiaomi nie są natywnym typem sprzętu, wymagają skryptu lub pluginu obsługującego BLE.',
    note: 'Domoticz has no native Xiaomi Mi hardware type; needs BLE plugin/script',
  },
  {
    wp: 208,
    find: '<p>W Domoticz dodaj sprzęt typu "CUPS" i wskaż adres serwera drukowania.</p>',
    replace: '<p>Domoticz nie ma natywnego typu sprzętu "CUPS" — do odczytu stanu drukarki (tusz, papier) potrzebny jest dodatkowy skrypt lub plugin odpytujący CUPS/API drukarki.</p>',
    note: 'Domoticz has no native CUPS hardware type',
  },
  {
    wp: 391,
    find: '<p>Pobranie narzędzia:</p>\n<pre><code>git clone https://github.com/JelmerT/cc2538-bsl.git</code></pre>\n<p>Podłącz CC2531 do Raspberry Pi przez USB. Wgranie firmware:</p>',
    replace: '<p>Pobranie narzędzia (dla CC2531 używamy flash_cc2531, nie cc2538-bsl — ten obsługuje tylko układy CC2538/CC26xx):</p>\n<pre><code>git clone https://github.com/jmichault/flash_cc2531.git</code></pre>\n<p>Podłącz CC2531 do Raspberry Pi przez GPIO (linie DD, DC, RESET i GND). Wgranie firmware:</p>',
    note: 'cc2538-bsl does not support CC2531; needs flash_cc2531 with GPIO wiring',
  },
  {
    wp: 391,
    find: '<pre><code>python3 cc2538-bsl/cc2538-bsl.py -p /dev/ttyACM0 -ew -v firmware.hex</code></pre>',
    replace: '<pre><code>python3 flash_cc2531/cc2531_flash.py -p /dev/ttyACM0 -ew -v firmware.hex</code></pre>',
    note: 'correct tool invocation for CC2531',
  },
]

async function main() {
  const payload = await getPayload({ config })

  let applied = 0
  const failures: string[] = []

  for (const fix of FIXES) {
    const result = await payload.find({
      collection: 'posts',
      limit: 1,
      where: { 'legacy.wordpressId': { equals: fix.wp } },
    })

    const post = result.docs[0]
    if (!post) {
      failures.push(`wp:${fix.wp} not found`)
      continue
    }

    const html = post.legacy?.renderHTML
    if (typeof html !== 'string' || !html.includes(fix.find)) {
      failures.push(
        `wp:${fix.wp} anchor not found: ${fix.find.slice(0, 60)}...`,
      )
      continue
    }

    await payload.update({
      collection: 'posts',
      id: post.id,
      data: {
        legacy: {
          ...post.legacy,
          renderHTML: html.replace(fix.find, fix.replace),
        },
      },
    })

    applied += 1
    console.log(`wp:${fix.wp} fixed: ${fix.note}`)
  }

  console.log(`applied: ${applied}/${FIXES.length}`)

  if (failures.length > 0) {
    console.error('FAILURES:')
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }

  await payload.db.destroy?.()
  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
