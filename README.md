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
- The agreed home variant: secret Monarchist; Hitler's execution reveals the Monarchist as Dictator, adds one Liberal policy step and removes Rote Kapelle from the game; executing the Dictator gives the joint Liberal/Communist/Anarchist victory when those factions are present.
- Rote Kapelle: created when an ordinary Fascist is converted while both Communists and Monarchist are enabled; knows ordinary Fascists but not the Monarchist; does not attend the next Congress; leaves the game after Hitler is executed.

## Testing

```bash
npm test
npm run simulate:base
npm run simulate:xl
npm run simulate:xl:stress
```

`npm test` runs deterministic rule/permission/privacy checks plus 1,280 extension-combination/player-count setup cases. `simulate:base` runs 1,000 random-agent base games. `simulate:xl` runs 1,400 random-agent games with all XL expansion switches enabled across 5–20 players. Some optional one-off roles are omitted at 5–6 players because there are not enough seats. `simulate:xl:stress` runs 10,000 such games across 5–20 players (625 per player count). The simulations are stress tests of the implemented rules, not proof of competitive balance: random agents do not play strategically and the 17–20 role ratios are experimental.

## Important rule decisions still requiring confirmation

Two details are not fully specified by the source PDF and are currently implemented as explicit working assumptions:

1. Emergency power cards are drawn after the President discards a policy and before the Chancellor chooses between the remaining two cards. This timing is necessary for Vote of No Confidence to operate on the President's discarded card.
2. The PDF's Radicalisation procedure explicitly protects Hitler and the Capitalist, but does not list the Monarchist. The implementation therefore allows the Monarchist to be converted: the player keeps the Monarchist role, changes party membership to Communist, and does not become Rote Kapelle. If the Monarchist later succeeds Hitler, the agreed Dictator succession changes the party back to Fascist. This is an explicit implementation interpretation, not a rule stated by the PDF.

The original rule PDFs are in `docs/` for reference.
