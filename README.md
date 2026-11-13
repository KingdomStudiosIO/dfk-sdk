# @defikingdoms/game-sdk

Build apps and games on [DeFi Kingdoms](https://defikingdoms.com). Read heroes, pets and equipment straight from chain, decode genes and bonuses, render heroes (static or animated with the game's own hero rig) and pets (sprite sheets), show items and balances, follow the marketplace, and send game transactions, all without reverse-engineering the game client.

```ts
import { ChainId, createDFKClient } from '@defikingdoms/game-sdk'

const dfk = createDFKClient({ chainId: ChainId.KAIA_MAINNET })

const heroes = await dfk.heroes.byOwner('0x…')
heroes[0].name              // "Shyla Venodius"
heroes[0].class             // "legionnaire"
heroes[0].statGenes.active1 // { d: 'Basic3', r1: 'Basic7', r2: 'Basic2', r3: 'Basic1' }

const items = await dfk.items.balances('0x…')  // one multicall for ~180 items
const tokens = await dfk.tokens.balances('0x…') // JEWEL, CRYSTAL/JADE, GOLD, native gas token…

const pets = await dfk.pets.byOwner('0x…')      // species, rarity, decoded gathering/crafting/combat bonuses
const gear = await dfk.equipment.forHero(heroes[0]) // equipped weapons, armor, accessory with bonus text
const sales = await dfk.market.recentSales('heroes') // straight from auction logs
```

## Demo

```sh
npm run demo   # http://localhost:5199
```

A framework-free page (`demo/`) built from the local source. It has a hero viewer (animated hero, stats, genes, gear, pet), a wallet explorer (heroes, pets, equipment, items, tokens), a market reader, a browser for all 427 pet appearances, and wallet-signed actions.

## Install

```sh
npm install @defikingdoms/game-sdk ethers@5
```

`ethers` v5 is a peer dependency, so the SDK shares your app's copy. Animated heroes need nothing else: the SDK plays the hero rig with its own player.

## Entry points

| Import | What's in it | Extra deps |
| --- | --- | --- |
| `@defikingdoms/game-sdk` | Client, chain config, hero/pet/equipment/item/token/profile reads, gene and bonus decoding, image URLs, market events, write actions, `PetRenderer`, multicall | `ethers` |
| `@defikingdoms/game-sdk/renderer` | `HeroRenderer`: animated heroes on any `<canvas>` (vanilla, Phaser, Pixi, …), plus `PetRenderer` | none |
| `@defikingdoms/game-sdk/react` | `<DFKProvider>`, data hooks, `<HeroCard>` (the game's card), `<HeroImage>` (classic art by default), `<AnimatedHero>`, `<PetCard>`, `<PetSprite>`, `<EquipmentIcon>`, `<ItemIcon>` | `react` (the hero renderer is loaded lazily, only if you render `<AnimatedHero>`) |

## Heroes

```ts
const hero = await dfk.heroes.get('1000000012345')     // null if it doesn't exist
const many = await dfk.heroes.getMany(ids)             // batched; missing ids are skipped
const ids  = await dfk.heroes.idsByOwner(address)      // includes heroes the owner has listed for sale
```

A `Hero` includes identity (`id`, `displayId`, `name`, `originRealm`), class, sub-class, profession, element, rarity, shiny, and generation, plus `stats`, growth chances, gathering `skills`, level and XP, stamina timing, summoning info, `equipment` token ids, and fully decoded `statGenes` / `visualGenes`, with dominant and all three recessives. Heroes on sale have `sale` set and `owner` pointing at the seller, not the auction contract.

Helpers you can use without a client:

```ts
import {
  decodeStatGenes, decodeVisualGenes, genesToKai,      // genes → labels (raw ids kept in `.raw`)
  getCurrentStamina, getStaminaRechargeSeconds, xpToNextLevel,
  getOriginRealm, getDisplayHeroId,
  getHeroImageUrl, getHeroAtlasUrl,
  parseHeroV3,                                          // bring your own RPC/indexer data
} from '@defikingdoms/game-sdk'
```

### Heroes on Metis

Sundered Isles keeps stat and visual genes off-chain. On Metis the SDK reads hero state from the PVP diamond and joins genes from the indexer the game client uses (`METIS_HERO_INDEXER_URL`, keyed by owner; override with `createDFKClient({ metisIndexerUrl })`). Metis stores no names, generation, summoning, stamina or profession skills, so those fields carry neutral defaults (`name` is `Hero #<id>`). If the indexer can't supply a hero's genes, the hero is still returned with `incomplete: true`, with class, rarity, level, stats and gear from chain.

## Pets

```ts
const pet = await dfk.pets.get('2000000001279')
pet.name          // custom name, or the species name ("Emberling")
pet.species       // { family, name, variant, rarity, pool, sprite }
pet.gathering     // { name: 'Clutch Collector', tier: 1, rarity: 'common', revealed: true, … }
pet.crafting      // { name: 'Woodworking bonus', tier: 2, revealed: false, … } (revealed once bonded)
pet.combat        // null, or e.g. { name: 'Stone Hide', value: 5, … }
isPetHungry(pet)  // equipped pets stop granting bonuses when hungry

await dfk.pets.byOwner(address)   // includes pets listed for sale (`pet.sale`)
```

`PET_CATALOG` holds every appearance per egg type, so you can show species without a chain read. `getPetSpriteUrl(pet)` gives the sprite sheet: a row of 72px frames played at 10 fps. `getPetCardArt(pet)` gives the layered card art (frame, gem, animated scenery, element icon).

**Animated pets** need no extra dependencies:

```ts
import { PetRenderer } from '@defikingdoms/game-sdk'

const renderer = new PetRenderer(canvas, pet, { scene: true }) // scene: the card's animated background
await renderer.ready
renderer.pause() / renderer.resume() / renderer.tick(dt)       // or drive it from your own loop
```

It scales by whole pixels to fit the canvas, so sprites stay crisp at any size.

## Equipment

```ts
const gear = await dfk.equipment.forHero(hero)    // weapon1, offhand1, armor, accessory, … and their visages
gear.weapon1?.name                                 // the game's item name
gear.weapon1?.bonuses.map(b => b.text)             // ["Gain 5.5% chance to inflict Bleed on hit"]
gear.weapon1?.weapon                               // base damage, speed, stat scaling …
gear.armor?.armor                                  // physical/magical defense, evasion …

await dfk.equipment.get('armor', [id])
await dfk.equipment.byOwner(address, { kinds: ['weapon'] })
```

Names, lore, type names, rarity, crafter, durability, enchantments and the game's own bonus tooltip text are filled in from data generated from the client. Shields and foci are `kind: 'offhand'` even though they live on the accessory contract. `item.image` is the icon on the game's art CDN (`configureAssets({ artBaseUrl })` to self-host).

## Marketplace

The DFK indexer API (`api.defikingdoms.com`) has been retired. The SDK reads marketplace activity straight from the auction contracts instead:

```ts
await dfk.market.listing('heroes', heroId)              // open listing or null
await dfk.market.listingsBySeller('pets', address)
await dfk.market.recentListings('heroes', { lookbackBlocks: 20_000 }) // still-open listings, cheapest first
await dfk.market.recentSales('weapons')                  // with timestamps
await dfk.market.events('armor', { fromBlock, toBlock, types: ['sold', 'cancelled'] })
getAuctionPrice(listing)                                 // clock-auction price right now
```

Markets are `heroes`, `pets`, `weapons`, `armor` and `accessories`. Log queries are split by the chain's `logBlockRange` (Kaia allows huge spans; 2048 is the conservative default). Pass `blockRange` for your own RPC.

## Write actions

```ts
const writer = dfk.connect(signer)   // any ethers v5 Signer on this chain

await writer.heroes.transfer(heroId, to)
await writer.heroes.list(heroId, { startPrice: '25' })           // approves the auction if needed
await writer.heroes.buy(heroId)                                    // approves CRYSTAL/JADE if needed
await writer.pets.cancelListing(petId)
await writer.equipment.transfer('weapon', id, to)
await writer.items.consume(getItem('staminaPotion')!, heroId)
await writer.items.transfer(getItem('goldBag')!, to, '100')
await writer.tokens.transfer(getToken('JEWEL')!, to, '1.5')
await writer.quests.start({ heroIds, quest: 'fishing', attempts: 5 })
await writer.quests.start({ heroIds, quest: 'training', stat: 'STR' })
await writer.quests.complete(heroId)
```

Every action returns the sent `ContractTransaction`; `await tx.wait()` for the receipt. Approvals are checked first and sent (and waited for) only when missing.

## Rendering heroes

The DFK hero generator service (`heroes.defikingdoms.com`), which used to serve hero PNGs and per-hero rig atlases, is offline. The SDK draws heroes itself from their genes, in one of two art styles:

- **Classic** (the default): the game client's own layers.
- **Hero generator** (`source: 'generator'`): the art the hero generator service drew for the game, now built in the browser from the [hero generator](https://github.com/KingdomStudiosIO/hero-generator)'s images, which ship in this package. It also shows equipped **armor and accessories** (helms, masks, crowns, in their dyes).

**Classic portrait** (the game's pixel-art view, any framework):

```ts
import { renderClassicHero } from '@defikingdoms/game-sdk'
const canvas = await renderClassicHero(hero, { scale: 4 })   // 59x46 logical pixels, scaled
```

**Hero generator portrait** (64x64 pixels times `scale`, with armor and accessories):

```ts
import { renderGeneratorHero } from '@defikingdoms/game-sdk/renderer'
const canvas = await renderGeneratorHero({ ...hero, gear: await dfk.equipment.forHero(hero) }, { scale: 4 })
```

`<HeroImage source="generator" gear={gear} />` does the same in React. `dfk.heroes.imageUrl(hero)` and `atlasUrl(hero)` still return the retired service's URLs.

**Hero card** (the game's card, front and back):

```ts
import { createHeroCard } from '@defikingdoms/game-sdk'
import { createAnimatedHeroCard } from '@defikingdoms/game-sdk/renderer'

const card = createHeroCard(hero)             // classic portrait; or createAnimatedHeroCard(hero)
document.body.append(card.element)            // 300x430, like the game
card.flip()                                   // back: stats, growth, genes, recessives, history
card.setPage('genes')
```

The front shows the hero on its background scene in its rarity frame: name banner, element/background/gender icons, HP/MP, class and sub-class, rarity, level and generation, equipment slots, and summons/stamina/XP bars. The back pages through stats (with stat-boost colors and gathering skills), growth, ability and visual genes with tier badges, recessive genes, recessive visual genes, and summon history. Clicking the card flips it (`flipOnClick: false` to handle that yourself). It uses the game's own stylesheet, generated from the client, scoped under `dfk-` class names and injected once per page. The game's fonts (Lora, Poppins) load from Google Fonts unless you pass `loadFonts: false`. Crafting professions aren't shown because the game only displays them once they're valid on chain, which the SDK doesn't read yet.

**Animated** (framework-free):

```ts
import { HeroRenderer, professionAnimation, HERO_ANIMATIONS } from '@defikingdoms/game-sdk/renderer'

const renderer = new HeroRenderer(canvas, hero)   // loops the class's idle stance; atlas built in the browser
// or with its equipped weapon and shield (and that weapon's animations, as in combat):
// new HeroRenderer(canvas, hero, { gear: await dfk.equipment.forHero(hero) })
await renderer.ready
renderer.play(professionAnimation('fishing'))
renderer.playOnce(HERO_ANIMATIONS.hurt)           // then returns to idle
renderer.animations                               // every animation in the rig
renderer.destroy()
```

By default (`source: 'local'`) the renderer builds the hero's atlas in the browser. The rig's own atlas is a complete default hero, and each hero's classic layers are painted into its cells. Heroes show their class clothing, colors, hair and appendages, and hold their class weapon (and shield, for knights, warriors, legionnaires and paladins) from the game's own weapon art. Pass `gear` (what `dfk.equipment.forHero(hero)` returns) to show the equipped weapon (or its visage) and shield instead, using the game's item art. Shields are hidden with two-handed weapons, and the default animations switch to the equipped weapon's set (`getHeroWeaponAnimationSet(hero, gear)`), as in combat. The classic layers have no art for armor and accessories. A few items have no art in the game client yet; those heroes keep their class weapon. The same `gear` option works on `createAnimatedHeroCard(hero, { renderer: { gear } })` and `<AnimatedHero gear={gear} />`.

`source: 'generator'` builds the atlas from the hero generator's art instead, as its service did for the game: the class clothing, plus the equipped armor and accessory when `gear` is given, and the equipped weapon and shield in the generator's own art. `'auto'` is the same (it used to try the retired service first). To draw an atlas of your own, pass `atlas` (a `RigAtlas`). `buildHeroAtlasImage(hero)` and `buildGeneratorHeroAtlasImage(hero)` return the painted texture and its standard `.atlas` text, for use with other skeletal animation runtimes.

Pass `{ autoplay: false }` and call `renderer.tick(deltaSeconds)` from your own game loop to drive it yourself. `onEvent` receives the events keyed in animations (such as `hit` when an attack lands).

**Posing heroes yourself** (battle replays, scrubbing, back views). `renderer.renderAt(animation, seconds, { loop })` draws one exact moment synchronously, with no crossfade and no events. Looping animations wrap the time and one-shots (`loop: false`) clamp it. It leaves the normal player alone, so a later `tick()` or `play()` carries on where it was. The animation must be loaded first (`await renderer.preload(...)`), and `renderer.duration(name)` gives its length in seconds. `onPose` sees every pose before it's drawn, from both `tick()` and `renderAt()`. In it you can hide a slot (set `attachments[i] = null`), rewrite `drawOrder`, or set `images[i]` to draw your own picture in a slot's place. Changes last for that frame only. `renderer.attachmentImage(slot, attachment?)` copies the picture an attachment draws for this hero, such as the head or body to paint a back view from.

```ts
const renderer = new HeroRenderer(canvas, hero, {
  autoplay: false,
  onPose: pose => {
    if (onWater) pose.attachments[pose.slots.indexOf('shadow')] = null // no ground shadow
  },
})
await renderer.ready
const attack = weaponAnimation(getHeroWeaponAnimationSet(hero), 'Hit')
await renderer.preload(attack, HERO_ANIMATIONS.hurt)

function show(replaySeconds: number) {
  // Any moment, in any order: the replay can jump back and forth.
  renderer.renderAt(attack, replaySeconds, { loop: false })
}
```

The animations ship pre-baked (`assets/hero-rig/baked/`): every bone's position at 60 frames per second, which image each slot shows, and the draw order. Playing one is a lookup, so the SDK contains no skeletal animation runtime. Each animation is a separate file of a few KB (gzipped), fetched the first time it plays; until it arrives the previous animation keeps playing. `play` and `playOnce` return a promise that resolves once the switch happens, and `renderer.preload(...names)` fetches animations ahead of time. Crossfades (`mix`, default 0.2 s) blend the baked poses, which can differ from the game by a pixel or two mid-fade.

**React**:

```tsx
import { DFKProvider, HeroCard, AnimatedHero, useHeroesByOwner } from '@defikingdoms/game-sdk/react'

<DFKProvider chainId={ChainId.KAIA_MAINNET}>
  <Roster address={address} />
</DFKProvider>

function Roster({ address }) {
  const { data: heroes, loading } = useHeroesByOwner(address)
  return heroes?.map(h => <HeroCard key={h.id} hero={h} animated />)   // the game's card; click to flip
}
```

`<HeroCard>` takes `animated`, a controlled `flipped` with `onFlip`, `page`, `ownerName` and `border`. The previous minimal card is now `<CompactHeroCard>`.

`CompactHeroCard` and `PetCard` are themeable through `--dfk-card-bg`, `--dfk-card-fg`, `--dfk-card-muted`, and `--dfk-card-border`. The hooks (`useHero`, `useHeroes`, `useHeroesByOwner`, `usePet`, `usePets`, `usePetsByOwner`, `useEquipment`, `useEquipmentByOwner`, `useHeroGear`, `useRecentListings`, `useRecentSales`, `useItemBalances`, `useTokenBalances`, `useProfile`) return `{ data, error, loading, refetch }`. If you already use React Query or SWR, call the client methods from those instead.

## Items & tokens

```ts
import { getItem, getItems, getItemByAddress, ITEM_CATALOG } from '@defikingdoms/game-sdk'

getItem('healthPotion')               // name, description, image, type, decimals, per-chain addresses
getItems(ChainId.KAIA_MAINNET)        // everything deployed there (no hidden/currency entries)
getItemByAddress(chainId, tokenAddr)  // reverse lookup, e.g. for Transfer events

await dfk.items.balances(address, { items: [getItem('healthPotion')!] })
await dfk.tokens.balances(address)    // TokenBalance[] with raw bigint + formatted string
dfk.tokens.powerToken()               // CRYSTAL on Avalanche and DFK Chain, JADE on Kaia
```

ERC-20 and ERC-1155 items are both handled. `formatAmount` / `parseAmount` convert between raw bigints and decimal strings.

## Chains

| Chain | id | Heroes | Pets | Equipment | Market | Quests | Items / tokens |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DFK Chain (Crystalvale), no longer active | 53935 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DFK Chain testnet | 335 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kaia (Serendale 2.0) | 8217 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Kaia Kairos | 1001 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Avalanche C-Chain / Fuji | 43114 / 43113 | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Metis (Sundered Isles) / Sepolia | 1088 / 59902 | ✅ genes via indexer | ✅ | ✅ | ✅ | ❌ | ✅ |

DFK Chain is no longer active; the game has moved to Avalanche C-Chain. The marketplace and quests aren't deployed on C-Chain yet. Heroes and pets minted there have ids from 3,000,000,000,001 and report `originRealm: 'avalanche'`, a provisional name until the game names the realm. Pass your own `provider` or `rpcUrl` to `createDFKClient` in production. The public RPCs are rate-limited.

## Assets & self-hosting

Pet sprites, pet cards and equipment icons come from the game's art CDN (`artBaseUrl`). The shared hero rig, both sets of hero art and a few item images ship inside this package under `assets/`, served by default from jsDelivr. To change either:

```ts
import { configureAssets } from '@defikingdoms/game-sdk'
configureAssets({ assetsBaseUrl: '/static/dfk-assets' }) // copy node_modules/@defikingdoms/game-sdk/assets there
// or per client: createDFKClient({ chainId, assets: { assetsBaseUrl: '…' } })
```

Relative base URLs such as `/static/dfk-assets` are resolved against the page. The hero rig (everything under `hero-rig/`, including about 8 MB of baked animations) loads from `rigBaseUrl`, which defaults to `assetsBaseUrl`. Set it when several asset folders should share one copy of the rig, for example a recolored set of `hero-classic/` layers: `{ assetsBaseUrl: '/dfk-assets/recolored', rigBaseUrl: '/dfk-assets' }`.

## Maintaining

Contract addresses, ABIs, hero name tables, the item catalog, pet appearances and bonus names, equipment names/lore/bonus text, the classic hero layer manifest (rendered from the client's own hero components) and art, the hero card stylesheet (compiled from the client's SCSS) with its images and gene display names, and the hero rig are generated from the game client. Addresses come from the client's address constants (`public/contracts.json` overrides them when a checkout has it), except Avalanche C-Chain and Fuji, which come from the smart-contracts repo's `data/contracts.json`:

```sh
INTERFACE_DIR=../interface SMART_CONTRACTS_DIR=../smart-contracts npm run sync   # regenerates src/generated/* and assets/
npm test                                   # includes golden gene tests copied from the client
DFK_LIVE=1 DFK_LIVE_CHAIN=8217 npx vitest run test/live.test.ts test/live-extras.test.ts   # hits real RPCs
```

The hero generator's art (`assets/hero-generator/`) and its rules (`src/generated/hero-generator.ts`) come from a checkout of [KingdomStudiosIO/hero-generator](https://github.com/KingdomStudiosIO/hero-generator). The sync copies its images and records how it combines them for each armor, accessory, weapon and class, by running its code with a stand-in image library that logs each step:

```sh
HERO_GENERATOR_DIR=../hero-generator npm run sync:hero-generator
```

The baked animations in `assets/hero-rig/baked/` are generated outside this repo from the game's rig export. If the sync changes `assets/hero-rig/skeleton.json`, `test/rig.test.ts` fails until the baked files are regenerated to match.

## Not yet covered

- Summoning, crafting, bridging, pet hatching/feeding, equipment repair and enchanting
- Marketplace search across all open listings: there is no on-chain index, and the DFK indexer API has been retired, so `recentListings` only sees listings created within its window
- Metis hero names, generation and summoning data (not stored on chain)
- Armor and accessories in the classic art style (use `source: 'generator'`)
- Avalanche C-Chain marketplace and quests (not deployed there yet)

## License

GPL-3.0-or-later, matching the game client this SDK is derived from.
