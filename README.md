# Secret Hitler Online XL (CZ/EN)

Fan-made online adaptation of Secret Hitler with selected XL rules and the agreed Monarchist/Dictator home variant. The application supports 5–20 players and two play modes:

1. **Personal devices:** each player uses their own phone/computer.
2. **Shared board:** a TV/laptop displays the board while players use their phones for secret actions.

The server owns all game state and secret information. Clients receive only the information their player is allowed to see. There is no private Communist chat.

## Run locally

Requires Node.js 18 or newer. There are no external npm dependencies.

```bash
npm start
```

Open `http://localhost:3000`. Set another port with `PORT=xxxx`.

## Deploy to Render

1. Push the contents of this directory to a GitHub repository.
2. In Render, choose **New → Web Service** and connect the repository.
3. Use **Build command:** `npm install` (or leave empty; there are no dependencies).
4. Use **Start command:** `npm start`.
5. Deploy. Render supplies `PORT` automatically.

Rooms are held in memory; a server restart clears active rooms. Do not use this build for paid/commercial play. The underlying game is licensed CC BY-NC-SA 4.0; this fan adaptation retains that non-commercial share-alike intent.

## Game configuration

- 5–20 players.
- The host alone toggles expansions and edits role counts. Other players can see the settings but cannot change them.
- Before roles are dealt, everyone sees a mandatory summary of active expansions and the role distribution.
- Role counts must add up exactly to the number of players. There is always exactly one Hitler; unique special roles (Capitalist, Anarchist, Monarchist) can be set to 0 or 1.
- The host may edit the suggested distribution. For Communist games, the PDF table is used for 6–16 players. The suggested 17–20 distributions are experimental and are not official XL rules.

## Implemented mechanics

- Base Liberal/Fascist/Hitler game and the normal election, policy, veto, investigation, special election and execution flow.
- Communist party, Communist policy deck and 6–8 / 9–10 / 11+ Communist tracker power sequences.
- Bugging, Radicalisation, Five-year Plan, Congress and Confession.
- Capitalist, including its victory condition and the additional Communist policy after its execution.
- Anarchist without Communists and Anarchist with Communists, including the separate Anarchist policy handling and win conditions.
- Anti-Communist, Anti-Fascist and Social Democratic policies.
- Article 48 and Enabling Act emergency powers.
- Longer Liberal tracker for larger rooms.
- **Agreed home variant:** the Monarchist is secretly aligned with the Fascists but is unknown even to Hitler and the other Fascists. The Monarchist is protected from Communist Radicalisation. If Hitler is assassinated while the Monarchist is alive, the Monarchist is revealed as the public Dictator, the game continues, Rote Kapelle leaves the game and the Liberal policy track advances by **two policies**. The Dictator cannot be Chancellor. If the Dictator is later assassinated, Liberals and Communists win together; the Anarchist also joins this victory if included.
- **Rote Kapelle:** created when an ordinary Fascist is converted to Communist while both Communists and Monarchist are enabled; knows ordinary Fascists but not the Monarchist; ordinary Fascists do not know them; does not attend the next Communist Congress; leaves the game after Hitler is assassinated and the Monarchist becomes Dictator.

## Source rules versus home variant

The original XL PDF protects Hitler and the Capitalist from Communist Radicalisation but does not list the Monarchist as protected. The project's agreed home variant **additionally protects the Monarchist**. This is a deliberate home-rule decision, not a claim about the wording of the source PDF.

The original XL Monarchist victory condition is distinct from the project's Dictator succession rule. In the source XL rules, the Monarchist wins if the Fascists win and Hitler has not been elected Chancellor after three Fascist policies. The online project's agreed home variant instead defines the Monarchist's secret identity and succession to Dictator after Hitler's assassination. On that succession, the Liberal policy track advances by two spaces.

## Testing

```bash
npm test
npm run simulate:base
npm run simulate:xl
npm run simulate:xl:stress
```

`npm test` runs deterministic rule/permission/privacy checks plus 1,280 extension-combination/player-count setup cases. `simulate:base` runs 1,000 random-agent base games. `simulate:xl` runs 1,400 random-agent games with all XL expansion switches enabled across 5–20 players. Some optional one-off roles are omitted at 5–6 players because there are not enough seats. `simulate:xl:stress` runs 10,000 such games across 5–20 players (625 per player count). The simulations are stress tests of the implemented rules, not proof of competitive balance: random agents do not play strategically and the 17–20 role ratios are experimental.

## Rulebook

The bilingual EN/CZ rules reference is provided as `Secret_Hitler_XL_Rules_EN-CZ.pdf`. It is an original summary/adaptation, not a reproduction of the original rulebook artwork. See the PDF for source links and licensing notes.

## License and attribution

Secret Hitler is licensed under CC BY-NC-SA 4.0. The XL expansion source also states CC BY-NC-SA 4.0. Preserve attribution, non-commercial use and share-alike terms when redistributing adaptations. This fan project is not an official product.
