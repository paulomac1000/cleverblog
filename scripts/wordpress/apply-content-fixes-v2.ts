import { getPayload } from 'payload'
import config from '@payload-config'

type Fix = {
  wp: number
  find: string
  replace: string
  note: string
}

const FIXES: Fix[] = [
  { wp: 34, find: 'Pisanie skryptów Pythonie', replace: 'Pisanie skryptów w Pythonie', note: 'typo' },
  { wp: 34, find: '(CMS lub Powershell, bez znaczenia)', replace: '(CMD lub PowerShell, bez znaczenia)', note: 'CMD not CMS' },
  { wp: 34, find: 'Teraz musimy pamiętać, żeby nie zamknąć okna konsoli.', replace: 'Dzięki opcji -f po uwierzytelnieniu tunel działa w tle, więc okno konsoli można zamknąć.', note: 'ssh -f backgrounds the tunnel' },
  { wp: 484, find: 'deamona', replace: 'demona', note: 'typo' },
  { wp: 484, find: 'Każda z usług działa w tle i jest uruchamiana przy starcie systemu.', replace: 'Usługi mogą działać w tle, a przy starcie systemu uruchamiane są usługi odpowiednio skonfigurowane.', note: 'overgeneralization' },
  { wp: 484, find: 'ExecStart=&lt;script_name&gt;', replace: 'ExecStart=&lt;absolute_script_path&gt;', note: 'ExecStart needs absolute path' },
  { wp: 477, find: 'jak przeglądać logi przeglądać logi procesów', replace: 'jak przeglądać logi procesów', note: 'duplicated phrase' },
  { wp: 477, find: 'wyświetla tylko kilka pierwszych wierszy logu', replace: 'wyświetla tylko kilka ostatnich wierszy logu', note: 'status shows last lines' },
  { wp: 477, find: 'wyświetli 50 pierwszych wierszy', replace: 'wyświetli 50 ostatnich wierszy', note: 'last lines' },
  { wp: 477, find: '-e</code>, Zobaczysz', replace: '-e</code>. Zobaczysz', note: 'punctuation' },
  { wp: 487, find: 'Aby sprawdzić w konsoli  status usługi', replace: 'Aby sprawdzić w konsoli status usługi', note: 'double space' },
  { wp: 267, find: 'który doda uprawnienia superużytkownika i utworzy katalog domowy', replace: 'które utworzą konto systemowe oraz jego katalog domowy', note: '-r system account, -m home dir' },
  { wp: 148, find: 'zaisntalować', replace: 'zainstalować', note: 'typo' },
  { wp: 148, find: 'Nalezy ręcznie', replace: 'Należy ręcznie', note: 'typo' },
  { wp: 148, find: 'nastepujące polecenie', replace: 'następujące polecenie', note: 'typo' },
  { wp: 148, find: 'nastepujący wynik', replace: 'następujący wynik', note: 'typo' },
  { wp: 79, find: 'bind-address = 127.0.0.0', replace: 'bind-address = 127.0.0.1', note: 'loopback is 127.0.0.1' },
  { wp: 79, find: "Delete FROM mysql.user WHERE Host &lt;&gt; 'localhost';", replace: "DROP USER 'YOUR_MYSQL_USERNAME'@'192.168.1.%';", note: 'DELETE would remove the just-created remote account' },
  { wp: 509, find: 'cd cc2652p-bsl', replace: 'cd cc2538-bsl', note: 'clone dir name mismatch' },
  { wp: 509, find: 'zigbee2mqqt', replace: 'zigbee2mqtt', note: 'typo' },
  { wp: 509, find: 'kordynatora', replace: 'koordynatora', note: 'typo' },
  { wp: 509, find: '<code><code>git clone', replace: '<code>git clone', note: 'nested code tag' },
  { wp: 256, find: 'passwd -g &lt;group&gt;', replace: 'gpasswd &lt;group&gt;', note: 'group passwords use gpasswd' },
  { wp: 256, find: 'Polecenie <code>paswd</code> aktualizuje', replace: 'Polecenie <code>passwd</code> aktualizuje', note: 'typo' },
  { wp: 256, find: 'tz. nie zobaczysz', replace: 'tzn. nie zobaczysz', note: 'abbreviation' },
  { wp: 256, find: 'hasło dowolnemu innemu użytkowników', replace: 'hasło dowolnemu innemu użytkownikowi', note: 'grammar' },
  { wp: 256, find: '/etc/shadows/', replace: '/etc/shadow', note: 'wrong path' },
  { wp: 256, find: 'aby niemożliwym było jego szybkie złamanie', replace: 'aby niemożliwe było jego szybkie złamanie', note: 'grammar' },
  { wp: 172, find: 'sudo tune2fs -l /dev/sdc1', replace: 'sudo tune2fs -l /dev/sda1', note: 'device inconsistency' },
  { wp: 172, find: 'co 10 restartów (montować)', replace: 'co 10 montowań (restartów)', note: 'tune2fs -c counts mounts' },
  { wp: 421, find: 'Przykłąd użycia', replace: 'Przykład użycia', note: 'typo' },
  { wp: 421, find: 'znalezione we wskazanych katalogu', replace: 'znalezione we wskazanym katalogu', note: 'grammar' },
  { wp: 421, find: 'odnosi się do dwóch powiązanych ze sobą rzeczy: protokołu SSH i polecenia <code>cp</code>.', replace: 'jest narzędziem do bezpiecznego kopiowania plików między hostami za pośrednictwem protokołu SSH.', note: 'inaccurate description of scp' },
  { wp: 421, find: 'scp user1@1.1.1.1:/var/ user2@2.2.2.2:/var/', replace: 'scp -r user1@1.1.1.1:/var/ user2@2.2.2.2:/var/', note: 'directory copy needs -r' },
  { wp: 101, find: 'oczwista', replace: 'oczywista', note: 'typo' },
  { wp: 101, find: 'w danym lokalizacjach', replace: 'w danych lokalizacjach', note: 'grammar' },
  { wp: 101, find: 'Ścieżki dodajesz następującym formacie.', replace: 'Ścieżki dodajesz w następującym formacie.', note: 'grammar' },
  { wp: 101, find: 'odświeżeniu trony', replace: 'odświeżeniu strony', note: 'typo' },
  { wp: 101, find: 'spospoby', replace: 'sposoby', note: 'typo' },
  { wp: 101, find: 'sekcji połączenia sieciowych', replace: 'sekcji połączeń sieciowych', note: 'grammar' },
  { wp: 101, find: 'najprostsza, intuicyjny a przede wszystkim', replace: 'najprostsza, intuicyjna, a przede wszystkim', note: 'grammar' },
  { wp: 495, find: 'Funkcja <em>chmod</em> jest nieodłącznym narzędziem', replace: 'Polecenie <em>chmod</em> jest nieodłącznym narzędziem', note: 'command not function' },
  { wp: 495, find: 'Funkcja <em>chmod </em>umożliwia również', replace: 'Polecenie <em>chmod</em> umożliwia również', note: 'command not function (2nd instance)' },
  { wp: 495, find: 'Funkcja <em>chmod </em>umożliwia jednoczesną', replace: 'Polecenie <em>chmod</em> umożliwia jednoczesną', note: 'command not function (3rd instance)' },
  { wp: 391, find: 'Poradnik jest zgody z każdym', replace: 'Poradnik jest zgodny z każdym', note: 'typo' },
  { wp: 391, find: 'BCM2835, BCM2836 and BCM2837, czyli dokładnie tych użytych w dowolnym RaspberryPi', replace: 'BCM2835, BCM2836 i BCM2837, używanych w starszych modelach Raspberry Pi', note: 'not every RPi; translation' },
  { wp: 206, find: 'Następujące pakiety Pythona zainstalowane na urządzeniu: <code>http.client</code>, <code>requests</code>, <code>paramiko</code> (tylko dla <code>Cisco EPC3925</code>)', replace: 'Następujące pakiety Pythona zainstalowane na urządzeniu: <code>requests</code> oraz <code>paramiko</code> (ten ostatni tylko dla routerów z <code>OpenWrt</code>). Moduł <code>http.client</code> jest częścią biblioteki standardowej Pythona i nie wymaga instalacji.', note: 'http.client is stdlib; paramiko is for OpenWrt SSH' },
  { wp: 206, find: 'pip3 install http.client requests paramiko', replace: 'pip3 install requests paramiko', note: 'http.client not installable via pip' },
  { wp: 206, find: '*/15 * * * * python3 /home/pi/apps/Raspberry-Internet-Watchdog/watchdog.internet.py', replace: '*/15 * * * * python3 /home/pi/Raspberry-Internet-Watchdog/watchdog.internet.py', note: 'path inconsistent with clone location' },
  { wp: 204, find: 'skorzystaj z pakietu <code>hcitool</code>', replace: 'skorzystaj z polecenia <code>hcitool</code> dostarczanego przez pakiet <code>bluez</code>', note: 'hcitool is part of bluez' },
  { wp: 204, find: 'pip3 install requests bluepy', replace: 'sudo apt-get install libglib2.0-dev\npip3 install requests bluepy', note: 'bluepy needs libglib2.0-dev to compile' },
  { wp: 158, find: 'Składania wygląda', replace: 'Składnia wygląda', note: 'typo' },
  { wp: 158, find: 'Wpisz \".\" (kropkę), wtedy wyszukiwanie rozpocznie się od folderu wyżej.', replace: 'Wpisz \".\" (kropkę), wtedy wyszukiwanie rozpocznie się od bieżącego katalogu.', note: 'dot means current dir' },
  { wp: 158, find: 'find /var plik.txt    #', replace: 'find /var -name plik.txt #', note: 'missing -name' },
  { wp: 158, find: 'find /var plik.txt -maxdepth 2', replace: 'find /var -maxdepth 2 -name plik.txt', note: 'missing -name' },
  { wp: 158, find: 'find -name *.jpg', replace: 'find -name "*.jpg"', note: 'glob needs quotes' },
  { wp: 158, find: 'find . -type f -not -name *.html', replace: 'find . -type f -not -name "*.html"', note: 'glob needs quotes' },
  { wp: 158, find: 'Usuń znalezione plikis', replace: 'Usuń znalezione pliki', note: 'typo' },
  { wp: 158, find: '<code>fd wyrażenie</code>', replace: '<code>fdfind wyrażenie</code>', note: 'Debian/RPi OS binary is fdfind' },
  { wp: 158, find: '<code>find log # wyszuka pliki zawierające log</code>', replace: '<code>fdfind log # wyszuka pliki zawierające log</code>', note: 'fd section used find instead of fdfind' },
  { wp: 158, find: "<code>fd '^log.*txt$'", replace: "<code>fdfind '^log.*txt$'", note: 'fd section used fd instead of fdfind' },
  { wp: 158, find: '<code>find log /var', replace: '<code>fdfind log /var', note: 'fd section used find instead of fdfind' },
  { wp: 158, find: '(dash)', replace: '(caret)', note: '^ is a caret, not a dash' },
  { wp: 208, find: 'repozytorium znajdującego się w Twoim katalogu domowego', replace: 'repozytorium znajdującego się w Twoim katalogu domowym', note: 'grammar' },
  { wp: 41, find: 'Możesz ostawić skrypty', replace: 'Możesz zostawić skrypty', note: 'typo' },
  { wp: 41, find: 'w polu login i hasło podając swoje dane', replace: 'w polach login i hasło podając swoje dane', note: 'grammar' },
  { wp: 41, find: 'Jeżeli folder się zamontował, to go domontujmy.', replace: 'Jeżeli folder się zamontował, to go odmontujmy.', note: 'unmount not dismount' },
  { wp: 202, find: 'W ten sposób włączysz zaawansowane reguły firewalla wymagane przez OpenVPN', replace: 'W ten sposób włączysz obsługę urządzenia TUN/TAP wymaganego przez OpenVPN', note: 'TUN/TAP is a device, not firewall rules' },
  { wp: 202, find: 'zaswobniku', replace: 'zasobniku', note: 'typo' },
  { wp: 202, find: 'mi domyślnie wskoczyło justowanie tekstu', replace: 'mi domyślnie włączyło się zawijanie tekstu', note: 'word wrapping, not justification' },
]

const TITLE_FIXES: { wp: number; find: string; newTitle: string }[] = [
  { wp: 477, find: 'Wyświetlanie logów w Linuksie (journalctl i tail)', newTitle: 'Wyświetlanie logów w Linuksie (systemctl i journalctl)' },
  { wp: 158, find: 'Wyszukiwanie plików w Linuksie (find i locate)', newTitle: 'Wyszukiwanie plików w Linuksie (find i fd)' },
]

async function main() {
  const payload = await getPayload({ config })

  let applied = 0
  const failures: string[] = []
  const htmlByWp = new Map<
    number,
    { wp: number; id: number; html: string; title: string }
  >()

  for (const fix of FIXES) {
    const existing = htmlByWp.get(fix.wp)

    if (existing === undefined) {
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
      htmlByWp.set(fix.wp, {
        wp: fix.wp,
        id: post.id,
        html: post.legacy?.renderHTML ?? '',
        title: post.title,
      })
    }

    const entry = htmlByWp.get(fix.wp)

    if (entry === undefined || !entry.html.includes(fix.find)) {
      failures.push(`wp:${fix.wp} anchor not found: ${fix.find.slice(0, 60)}`)
      continue
    }

    entry.html = entry.html.replace(fix.find, fix.replace)
    applied += 1
  }

  const titleUpdates: string[] = []

  for (const entry of htmlByWp.values()) {
    const titleEntry = TITLE_FIXES.find((t) => t.wp === entry.wp)
    const data: Record<string, unknown> = {
      legacy: { renderHTML: entry.html },
    }
    if (titleEntry && entry.title === titleEntry.find) {
      data.title = titleEntry.newTitle
      data.meta = { title: titleEntry.newTitle }
      titleUpdates.push(`wp:${entry.wp} -> ${titleEntry.newTitle}`)
    }
    await payload.update({
      collection: 'posts',
      id: entry.id,
      data,
    })
  }

  for (const t of titleUpdates) console.log(`title: ${t}`)

  console.log(`content fixes applied: ${applied}/${FIXES.length}`)

  if (failures.length > 0) {
    console.error('FAILURES:')
    for (const f of failures) console.error(`  - ${f}`)
  }

  await payload.db.destroy?.()
  process.exit(failures.length > 0 ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
