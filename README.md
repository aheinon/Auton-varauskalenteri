# Auton varauskalenteri

Yksinkertainen varauskalenteri yhteiskäyttöautolle. Ei kirjautumista: kaikki, joilla on pääsy sivulle, voivat lisätä, muokata ja poistaa varauksia.

- **Kuukausinäkymä** ja lista **tulevista varauksista**
- Varaus muutamaksi tunniksi, **koko päiväksi** tai **useaksi päiväksi**
- **Lisätiedot**-kenttä jokaiseen varaukseen
- **"Auton saa tarvittaessa"** -merkintä (esim. auto autolabrassa opetuskäytössä koko viikon, mutta sieltä saa tarvittaessa). Nämä näkyvät kalenterissa raidallisina keltaisina.
- Varoitus päällekkäisistä varauksista – tallentaa silti, jos käyttäjä vahvistaa (sovitaan varaajan kanssa)
- Selain muistaa varaajan nimen seuraavaa kertaa varten

## Käynnistys

Vaatii Node.js 18 tai uudemman. Ulkoisia riippuvuuksia ei ole.

```sh
npm start
```

Avaa sitten http://localhost:3000.

### Asetukset (ympäristömuuttujat)

| Muuttuja | Oletus | Kuvaus |
|---|---|---|
| `PORT` | `3000` | Portti |
| `DATA_FILE` | `data/bookings.json` | Tiedosto, johon varaukset tallennetaan |
| `ACCESS_PASSWORD` | *(tyhjä)* | Valinnainen yhteinen salasana. Jos asetettu, selain kysyy sen kerran (käyttäjänimellä ei väliä). |

Varaukset ovat tavallisessa JSON-tiedostossa, joten varmuuskopioksi riittää kopioida `data/bookings.json`.

## Testit

```sh
npm test
```
