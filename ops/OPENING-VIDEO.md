# Diavideo en interactieve galerij

Beheer maakt bij Publiceren vier MP4's: dag/nacht × breedbeeld/mobiel. Alle gepubliceerde zalen, schilderijen en sokkels met een GLB-kunstwerk zitten in de route. Lege sokkels worden overgeslagen. De bestaande wandvolgorde blijft behouden; bezette sokkels worden ruimtelijk ingevoegd. Een wijziging in iedere zaal maakt de oude video ongeldig. De video wordt gegenereerd uit dezelfde gevalideerde momentopname als de publicatie.

Video is de blijvende diavoorstelling, niet uitsluitend een laadscherm. Hij begint op het overzicht uit het goedgekeurde aanzicht, wacht één seconde en blijft daarna rondgaan. De camera beweegt twee seconden tussen werken. De zaalovergang loopt door de gekalibreerde boog: aan weerszijden worden positie en kijkrichting met dezelfde starre transformatie omgerekend. De terugweg sluit op het eerste overzicht aan.

De 3D-bronnen laden ondertussen. Gedurende video wordt de doorlopende 3D-rendering gepauzeerd. Bij interactie pauzeert de video; het laatst weergegeven videoframe bepaalt de 3D-camera. De video verdwijnt pas nadat de volledige 3D-scène is voorbereid. Bij hervatten beweegt 3D naar het geselecteerde kunstwerk. Het bijbehorende videoframe wordt gedecodeerd, de camera wordt gecontroleerd en pas dan neemt de video over. De `requestVideoFrameCallback`-tijd is leidend; geen onafhankelijke diatimer naast de video.

Opname: WebCodecs met Mediabunny 1.62.1 (MIT), 30 fps, breedbeeld 3200 × 1000 en mobiel 1080 × 1350. Tijdens stilstaande camerastanden wordt hetzelfde beeld hergebruikt. Opname gebruikt de actuele webgalerij, geen nieuwe Blender/Cycles-render. Beheer toont het renderpreview in beeld omdat browsers onzichtbare iframes kunnen pauzeren. Laat het beheertabblad open. De GPU maakt maar één variant tegelijk.

De afzonderlijke bestanden worden in kleine, geauthenticeerde delen verstuurd; de beheerpublicatie verwijst naar uploads die aan dezelfde sessie en conceptversie gebonden zijn. Onvolledige uploads, gewijzigde concepten of renderfouten vervangen de bestaande publicatie niet. De huidige limiet is 90 MB per videovariant; een langere galerij die dit overschrijdt vraagt opsplitsing in meerdere videosegmenten, niet automatisch lagere beeldkwaliteit. GitHub-publicaties nemen `content/opening.json` en alle daarin genoemde bestanden mee.

De MP4-metadata staat vooraan voor snel starten. Bezoekers laden alleen de passende variant. De encoder en beheerbestanden gaan niet mee naar de publieke build. Ontbrekende of verouderde video, geblokkeerd afspelen, databesparing en verminderde beweging houden de 3D/beeldfallback beschikbaar. De versie van het camerapad is 2; de galerijhandtekening omvat alle zalen.

Controles: `node --test --test-isolation=none tools/gallery-tour.test.mjs tools/opening-video.test.mjs tools/video-publication.test.mjs tools/gallery.test.mjs`.

Videostart: download de passende MP4 meteen naast de collectiecontrole; afspelen blijft geblokkeerd totdat de revisie klopt. Start de zware 3D-import pas na het eerste videoframe en minstens drie seconden buffer. Een begrensde wachttijd houdt de 3D-fallback beschikbaar bij fouten. 3D-voorbereiding pauzeert de lopende video niet. De eerste statische overzichtsduur is één seconde; de overige camerabewegingen blijven gelijk. Controle: tools/video-startup.test.mjs.
