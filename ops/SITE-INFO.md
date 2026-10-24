# Informatieknop voor bezoekers

Het kleine i-knopje linksonder opent de bouwersvermelding (Milton Ribeiro), vereiste assetvermeldingen en aanvullende juridische informatie. Het werkt ook tijdens laden en in volledig scherm.

`content/site-info.json` bevat `assets` en `legal`. De publieke build selecteert alleen metadata van daadwerkelijk geplaatste assets en materialen; verwijderde objecten verdwijnen uit de vermeldingen. Meerdere exemplaren leveren één vermelding op. CC0-vermeldingen zijn optioneel; expliciet `attributionRequired: true` behoudt een vermelding. Bij imports moeten licentiegegevens eerst worden gecontroleerd en in dit bestand worden vastgelegd, zodat ook builds op GitHub zonder de lokale assetbibliotheek ze behouden. De lokale build kan metadata aanvullen uit de private bibliotheek, maar publiceert die bibliotheek niet.

Voor een asset: `id` (zelfde als het geplaatste asset), `title`, `credit` (maker/vereiste attribution), `license`, `licenseUrl`, `source`, en indien van toepassing `copyright`, `changes` en `notice`. Deze velden worden als tekst getoond. Leg eventuele bewerkingen, zoals omzetting naar splats, expliciet vast. Een vermelding geeft op zichzelf geen gebruikstoestemming. Controleer afwijkende licentievoorwaarden vóór import.

Juridische secties: `legal: [{"title":"…", "text":"…", "url":"https://…", "linkLabel":"…"}]`. Lege secties verschijnen niet. Alleen HTTP(S)-links zijn toegestaan. Vul uitsluitend gecontroleerde contact-/bedrijfsgegevens en privacyteksten in die overeenkomen met de werkelijk gebruikte functies. Er zijn nog geen bedrijfsspecifieke juridische teksten aangeleverd; de lege configuratie is geen verklaring van juridische volledigheid.

Test: `node --test --experimental-test-isolation=none tools/site-credits.test.mjs`.
