# Čierny trh — nasadenie na Netlify (so zdieľaným backendom)

Táto verzia už NEUKLADÁ účty a objednávky do prehliadača každého hráča zvlášť.
Všetko ide cez jednu spoločnú serverless funkciu (`netlify/functions/shop-api.js`)
a databázu Netlify Blobs. Vďaka tomu:

- účty vytvorené na telefóne aj počítači sú tie isté,
- admin panel ukazuje NAOZAJ všetkých hráčov a všetky objednávky,
- Discord webhook URL je teraz len na serveri — v HTML kóde stránky sa už vôbec nenachádza.

⚠️ Dôležité: **drag & drop nahrávanie (Netlify Drop) na toto nestačí** — nespúšťa
serverless funkcie. Treba to nahrať jedným z týchto dvoch spôsobov nižšie.

---

## Spôsob A — cez GitHub (odporúčané, najjednoduchšie na údržbu)

1. Vytvor si nový repozitár na [github.com](https://github.com) (napr. `cierny-trh`).
2. Nahraj tam **celý obsah tohto priečinka** (zachovaj štruktúru priečinkov presne tak, ako je).
3. Choď na [app.netlify.com](https://app.netlify.com) → **Add new site → Import an existing project**.
4. Vyber svoj GitHub repozitár.
5. Build nastavenia nechaj takto:
   - **Build command:** (nechaj prázdne)
   - **Publish directory:** `public`
6. Klikni **Deploy**.
7. Choď do **Site configuration → Environment variables** a pridaj DVE premenné:
   - Key: `DISCORD_WEBHOOK_URL` (objednávky zo skrytého shopu "Obľúbenci")
     Value: `https://discord.com/api/webhooks/1522341406344089600/xwnJrGgSkuUrJ_kMHtE--lC_WquJxepIdI0Tek1cOz9La3uyy0NOx6rrBfAYee27nPj_`
   - Key: `DISCORD_WEBHOOK_URL_PUBLIC` (objednávky z verejného cenníka — bežní ľudia)
     Value: `https://discord.com/api/webhooks/1522417337947525230/u-0u0qoMcWn1yaOMPv05EuEG2klEzZUvqd-PVji5NVSk1Ag-WO2-3RR1kfQ7MMzFD1QX`
8. **Deploys → Trigger deploy → Deploy site** (aby sa premenné prejavili).

Od teraz — každý ďalší update stačí nahrať do GitHub repozitára a Netlify to automaticky znova nasadí.

---

## Spôsob B — cez Netlify CLI (bez GitHubu, priamo z počítača)

1. Nainštaluj si [Node.js](https://nodejs.org) (ak ho nemáš).
2. Otvor terminál/príkazový riadok v tomto priečinku (tam, kde je `netlify.toml`).
3. Nainštaluj Netlify CLI:
   ```
   npm install -g netlify-cli
   ```
4. Prihlás sa:
   ```
   netlify login
   ```
5. Nainštaluj závislosti funkcie:
   ```
   npm install
   ```
6. Prepoj/vytvor stránku:
   ```
   netlify init
   ```
   (ak už máš existujúcu Netlify stránku, vyber "Link this directory to an existing site" a vyber ju)
7. Nastav Discord webhook ako environment variable:
   ```
   netlify env:set DISCORD_WEBHOOK_URL "https://discord.com/api/webhooks/1522341406344089600/xwnJrGgSkuUrJ_kMHtE--lC_WquJxepIdI0Tek1cOz9La3uyy0NOx6rrBfAYee27nPj_"
   ```
8. Nahraj naostro:
   ```
   netlify deploy --prod
   ```

---

## Ako to overiť, že funguje

1. Otvor svoju novú URL adresu (napr. `https://tvoja-stranka.netlify.app`).
2. V sekcii **ÚČET** sa zaregistruj pod ľubovoľným menom.
3. Otvor tú istú stránku v **inom prehliadači alebo na inom zariadení** a zaregistruj iné meno (alebo popros kamaráta).
4. Prihlás sa ako owner (napr. Andrej Kotrbal / `x36gbUCLgbV2rYS#`) a rozbaľ **Admin panel** — teraz by si mal vidieť **oba** účty, aj ten vytvorený na inom zariadení.

Ak sa admin panel nezobrazí alebo hlási chybu, skontroluj v Netlify dashboarde
**Functions** záložku — tam uvidíš logy/chyby zo `shop-api.js`.

---

## Ak sa zobrazí chyba "environment has not been configured to use Netlify Blobs"

Toto sa stáva, keď Netlify automaticky nerozpozná kontext stránky pre Blobs
(závisí od spôsobu nasadenia). Vyrieši sa to pridaním **dvoch environment
variables** navyše:

1. Choď do Netlify dashboardu → tvoja stránka → **Site configuration → General → Site details**
   a skopíruj **Site ID** (vyzerá napr. `a1b2c3d4-5678-90ab-cdef-1234567890ab`).

2. Choď do Netlify dashboardu → klikni na svoj profil vpravo hore → **User settings**
   → **Applications** → sekcia **Personal access tokens** → **New access token**.
   Pomenuj ho (napr. "shop-blobs"), vytvor ho a **hneď si skopíruj hodnotu**
   (zobrazí sa len raz).

3. V nastaveniach svojej stránky choď do **Site configuration → Environment variables**
   a pridaj:
   - `BLOBS_SITE_ID` = (Site ID z kroku 1)
   - `BLOBS_TOKEN` = (token z kroku 2)

4. **Deploys → Trigger deploy → Deploy site** (nech sa premenné načítajú).

Po tomto by chyba mala zmiznúť — funkcia teraz použije tieto hodnoty namiesto
automatickej detekcie.

---


| Meno | Heslo |
|---|---|
| Andrej Kotrbal | `x36gbUCLgbV2rYS#` |
| Matias Alejandro Cabrera | `Ct9-Owner-Vault-42x` |
| James Redwood | `Ct9-Owner-Vault-42x` |

Tieto sú teraz definované priamo v `netlify/functions/shop-api.js` (premenná
`OWNER_CREDENTIALS`), nie v HTML — takže ich nevidno v zdrojovom kóde stránky.
Ak ich chceš zmeniť, uprav tento súbor a znova nasaď stránku.

## Heslo do skrytého shopu ("Obľúbenci")

Nezmenené — stále `qGbUXDN5pzA25YWd`, stále cez klik na skryté "H" v "TRH".
Toto zostáva overované na strane prehliadača (nie je to citlivé dáta, len
jednoduchý zámok pre katalóg).
