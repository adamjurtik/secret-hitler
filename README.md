# Secret Hitler – online (CZ/EN)

Webová aplikace pro hraní Secret Hitler na více zařízeních. Hraje 5–10 hráčů.

**Dva režimy:**
1. **Každý na svém zařízení:** každý hráč vidí na svém telefonu celý hrací plán, své akce, historii a chat. Dá se hrát i na dálku.
2. **Společná obrazovka:** hrací plán, historie, chat a dramatická oznámení (hlasování, zákony, popravy) běží na televizi nebo notebooku, který nepatří žádnému hráči. Telefony slouží jen k tajným akcím a k chatu.

Připojení probíhá kódem ze 4 písmen nebo naskenováním QR kódu fotoaparátem telefonu.

## Spuštění

Potřebuješ jen **Node.js 18+**. Projekt nemá žádné závislosti (není potřeba `npm install`).

```bash
node server.js
# běží na http://localhost:3000 (port nastavíš proměnnou PORT)
```

Pro hraní v jedné Wi‑Fi síti stačí spustit server na počítači a ostatní otevřou `http://<IP-počítače>:3000`.

## Nasazení na internet zdarma (např. Render.com)

1. Nahraj složku do repozitáře na GitHubu.
2. Na render.com zvol *New → Web Service* a vyber repozitář.
3. Jako Build command nech prázdné (nebo `npm install`), jako Start command zadej `node server.js`.
4. Hotovo. QR kód v čekárně automaticky ukazuje adresu nasazené aplikace.

Funguje to i na Railway, Fly.io nebo na vlastním VPS. Na bezplatném Renderu server po 15 minutách nečinnosti usne a první načtení pak trvá asi 30 s.
Hry se drží v paměti serveru, takže restart serveru rozehrané hry smaže. Neaktivní místnosti se samy mažou po 6 hodinách.

## Co aplikace umí

- Všechna pravidla: role podle počtu hráčů, Hitler zná fašisty jen v 5–6 hráčích, omezení volitelnosti (včetně výjimky pro 5 živých hráčů), volební ukazatel a chaos, prezidentské pravomoci podle počtu hráčů (prověření, náhled, mimořádné volby, poprava), veto po 5 fašistických zákonech, výhra zvolením Hitlera po 3 fašistických zákonech.
- **Tajné informace zná jen server.** Každé zařízení dostane jen to, co smí vidět (role, karty v ruce, výsledky prověření).
- Role se zobrazí až po klepnutí na „obálku“, aby nikdo nenakoukl.
- Historie vlád, hlasování (kdo jak hlasoval) a nepovinná tvrzení prezidenta a kancléře o tom, jaké karty dostali.
- Textový chat (popravení hráči nesmí psát).
- Návrat po odpojení: po obnovení stránky nebo výpadku sítě se hráč vrátí na své místo.
- Zakladatel (v režimu se společnou obrazovkou je to ta obrazovka) spouští hru, vyhazuje hráče z čekárny a může spustit novou hru se stejnými hráči.
- Přepínač čeština / angličtina.

## Struktura

- `server.js` – HTTP server, místnosti, herní engine, realtime přes Server-Sent Events
- `public/index.html`, `style.css`, `app.js` – klient
- `public/i18n.js` – texty CZ/EN
- `public/qr.js` – generátor QR kódů (vlastní, bez knihoven)

## Licence

Fanouškovská adaptace hry **Secret Hitler** od Mika Boxleitera, Tommyho Marangese a Maca Schuberta (https://www.secrethitler.com).
Původní hra má licenci **CC BY-NC-SA 4.0** a tato adaptace je vydána pod stejnou licencí. Je určena jen k nekomerčnímu použití.
Změny oproti originálu: převedení do digitální podoby pro více zařízení, vlastní grafika a ikony, doplněná historie, chat a nepovinná tvrzení o kartách.
