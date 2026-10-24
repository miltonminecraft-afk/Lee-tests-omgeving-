# Openingsvideo

Beheer maakt bij Publiceren automatisch vier MP4-video’s: dag/nacht × breedbeeld/mobiel. Afbeeldingen, lijsten en plaatsingen komen uit dezelfde gevalideerde galerijsnapshot als de publicatie. Renderen gebeurt lokaal in de beheerbrowser via WebCodecs en Mediabunny 1.62.1 (MIT), zonder cloudaccount. Laat het beheertabblad open tot Publiceren klaar is. Als opnemen mislukt of het concept intussen is gewijzigd, blijft de vorige publicatie staan.

De opname rendert ieder frame apart en codeert daarna op 30 fps, zodat een tragere GPU de animatie niet vertraagt in het eindbestand. Resoluties: breedbeeld 3200 × 1000; mobiel 1080 × 1350. De bestaande cameradoelen en smoothstep-animatie worden gebruikt. De eerste twintig seconden bevatten de openingsbeweging, het overzicht en de eerste twee werken in galerijvolgorde (korter bij minder werken). Het is een opname van de actuele webgalerij; geen nieuwe Blender/Cycles-render.

De bezoeker laadt alleen de passende MP4. Metadata staat vooraan (fast start). De 3D-scène laadt ondertussen. Op het overnamemoment gebruikt 3D dezelfde tijd, camerapositie, kijkrichting, uitsnede en easing; de bezoeker hoeft niet te wachten tot de film afloopt. De volgende dia volgt de lopende volgorde.

`content/opening.json` koppelt beelden en video’s aan `openingSignature`. Ook de actuele `content/gallery.json` wordt vóór afspelen vergeleken met de versie in de HTML, zodat gecachte HTML nooit een video van een oude inrichting start. Ontbrekende/verouderde video, geblokkeerd automatisch afspelen, databesparing of verminderde beweging valt terug op het openingsbeeld. Bij wijzigingen aan het camerapad moet OPENING_VIDEO_VERSION worden verhoogd en opnieuw gepubliceerd.

De encoder staat in `vendor/baking` en gaat niet mee naar de publieke build. Video’s en camera-informatie worden via het beveiligde beheer samen met de publicatie opgeslagen. Op GitHub moet de normale publicatie ook `content/opening.json` plus de genoemde afbeeldingen en MP4-bestanden meenemen; bestaande publieke builds nemen uitsluitend deze actieve bestanden op.

Controle: node --test --experimental-test-isolation=none tools/opening-video.test.mjs tools/gallery.test.mjs
