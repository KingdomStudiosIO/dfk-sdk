import { Contract, constants, type ContractTransaction, type Signer } from 'ethers'
import {
  ERC1155_ABI,
  ERC20_ABI,
  HERO_CORE_ABI,
  ITEM_CONSUMER_ABI,
  PET_CORE_ABI,
  QUEST_CORE_ABI,
  WEAPON_CORE_ABI,
} from './abis'
import { requireContractAddress, type ContractName } from './addresses'
import { auctionIface } from './auctions'
import { getChain } from './chains'
import { getEquipmentContractKind } from './equipment/catalog'
import type { EquipmentKind } from './equipment/types'
import { parseAmount } from './format'
import type { ItemDefinition } from './items/types'
import { MARKET_CONTRACTS, type MarketName } from './market'
import { getPowerToken, NATIVE, type TokenDefinition } from './tokens'

type Id = string | number | bigint
type Amount = bigint | string

/** Quest instances the QuestsV3 contract accepts. */
export const QUEST_INSTANCES = {
  fishing: 1,
  foraging: 2,
  goldMining: 3,
  /** CRYSTAL on DFK Chain, JADE on Kaia. */
  tokenMining: 4,
  gardening: 5,
  training: 6,
} as const
export type QuestName = keyof typeof QUEST_INSTANCES

/** Training quest `type` per stat, matching the contract's enum. */
export const TRAINING_STATS = ['STR', 'INT', 'WIS', 'LCK', 'AGI', 'VIT', 'END', 'DEX'] as const
export type TrainingStat = (typeof TRAINING_STATS)[number]

export interface StartQuestOptions {
  heroIds: readonly Id[]
  quest: QuestName
  /** Attempts per hero (stamina-based quests). Defaults to 1. */
  attempts?: number
  /** Quest level: 0 or 10 for professions, 1+ for training. Defaults to 0 (1 for training). */
  level?: number
  /** Training only: which stat to train. */
  stat?: TrainingStat
  /** Gardening only: the liquidity pool id of the garden. */
  gardenPoolId?: number
}

export interface ListingOptions {
  /** Price in the power token (CRYSTAL / JADE), as a decimal string or raw bigint. */
  startPrice: Amount
  /** Defaults to `startPrice` (a fixed price). */
  endPrice?: Amount
  /** Seconds to move from start to end price. Defaults to 60, like the game. */
  durationSeconds?: number
  /** Only this address may buy. */
  privateBuyer?: string
}

const MARKET_NFT: Record<MarketName, ContractName> = {
  heroes: 'heroCore',
  pets: 'petCore',
  weapons: 'weaponCore',
  armor: 'armorCore',
  accessories: 'accessoryCore',
}

const EQUIPMENT_MARKET: Record<'weapon' | 'armor' | 'accessory', MarketName> = {
  weapon: 'weapons',
  armor: 'armor',
  accessory: 'accessories',
}

const toRaw = (amount: Amount, decimals: number) => (typeof amount === 'bigint' ? amount : parseAmount(amount, decimals))

/**
 * Signs and sends game transactions. Every action returns the sent `ContractTransaction`;
 * call `.wait()` for the receipt. Actions that need an approval first (listing, buying,
 * consuming) check it and send the approval transaction when missing, then wait for it.
 *
 * ```ts
 * const writer = dfk.connect(signer)
 * await (await writer.heroes.transfer(heroId, to)).wait()
 * ```
 */
export function createDFKWriter(signer: Signer, chainId: number) {
  const chain = getChain(chainId)
  const contract = (name: ContractName, abi: readonly unknown[]) =>
    new Contract(requireContractAddress(name, chainId), abi as any, signer)
  const account = () => signer.getAddress()

  /** Approves `operator` for all of an NFT collection if it isn't already. */
  async function ensureNftApproval(nft: ContractName, operator: string): Promise<void> {
    const c = contract(nft, PET_CORE_ABI) // every NFT core exposes the same approval functions
    if (!(await c.isApprovedForAll(await account(), operator))) await (await c.setApprovalForAll(operator, true)).wait()
  }

  /** Approves `spender` for at least `amount` of an ERC-20 if the allowance is lower. */
  async function ensureAllowance(token: string, spender: string, amount: bigint): Promise<void> {
    const c = new Contract(token, ERC20_ABI as any, signer)
    const allowance = BigInt((await c.allowance(await account(), spender)).toString())
    if (allowance < amount) await (await c.approve(spender, constants.MaxUint256)).wait()
  }

  function market(name: MarketName) {
    const auction = () => new Contract(requireContractAddress(MARKET_CONTRACTS[name], chainId), auctionIface, signer)
    return {
      /** Lists a token on the clock auction, approving the auction contract first if needed. */
      async list(tokenId: Id, { startPrice, endPrice = startPrice, durationSeconds = 60, privateBuyer }: ListingOptions) {
        const a = auction()
        await ensureNftApproval(MARKET_NFT[name], a.address)
        return a.createAuction(
          tokenId.toString(),
          toRaw(startPrice, 18),
          toRaw(endPrice, 18),
          durationSeconds,
          privateBuyer ?? constants.AddressZero
        ) as Promise<ContractTransaction>
      },
      cancelListing(tokenId: Id): Promise<ContractTransaction> {
        return auction().cancelAuction(tokenId.toString())
      },
      /**
       * Buys a listed token at its current price. `maxPrice` guards against the price moving
       * up between reading and sending (defaults to the current price).
       */
      async buy(tokenId: Id, { maxPrice }: { maxPrice?: Amount } = {}): Promise<ContractTransaction> {
        const a = auction()
        const price = BigInt((await a.getCurrentPrice(tokenId.toString())).toString())
        const bid = maxPrice === undefined ? price : toRaw(maxPrice, 18)
        if (bid < price) throw new Error(`Listing costs ${price}, more than maxPrice ${bid}`)
        const powerToken = getPowerToken(chainId)?.addresses[chain.id]
        if (!powerToken || powerToken === NATIVE) throw new Error(`No power token known for ${chain.name}`)
        await ensureAllowance(powerToken, a.address, bid)
        return a.bid(tokenId.toString(), bid)
      },
    }
  }

  async function transferNft(nft: ContractName, abi: readonly unknown[], tokenId: Id, to: string) {
    return contract(nft, abi).transferFrom(await account(), to, tokenId.toString()) as Promise<ContractTransaction>
  }

  const equipmentNft = (kind: EquipmentKind): ContractName => `${getEquipmentContractKind(kind)}Core` as ContractName

  return {
    chainId,
    signer,
    heroes: {
      transfer: (heroId: Id, to: string) => transferNft('heroCore', HERO_CORE_ABI, heroId, to),
      ...market('heroes'),
    },
    pets: {
      transfer: (petId: Id, to: string) => transferNft('petCore', PET_CORE_ABI, petId, to),
      ...market('pets'),
    },
    equipment: {
      transfer: (kind: EquipmentKind, id: Id, to: string) => transferNft(equipmentNft(kind), WEAPON_CORE_ABI, id, to),
      list: (kind: EquipmentKind, id: Id, opts: ListingOptions) => market(EQUIPMENT_MARKET[getEquipmentContractKind(kind)]).list(id, opts),
      cancelListing: (kind: EquipmentKind, id: Id) => market(EQUIPMENT_MARKET[getEquipmentContractKind(kind)]).cancelListing(id),
      buy: (kind: EquipmentKind, id: Id, opts?: { maxPrice?: Amount }) =>
        market(EQUIPMENT_MARKET[getEquipmentContractKind(kind)]).buy(id, opts),
    },
    items: {
      /** Sends an inventory item. `amount` is a decimal string in the item's units, or raw. */
      async transfer(item: ItemDefinition, to: string, amount: Amount): Promise<ContractTransaction> {
        const address = item.addresses[chainId]
        if (!address) throw new Error(`${item.name} is not on ${chain.name}`)
        const raw = toRaw(amount, item.decimals)
        if (item.standard === 'erc1155') {
          return new Contract(address, ERC1155_ABI as any, signer).safeTransferFrom(await account(), to, item.tokenId, raw, '0x')
        }
        return new Contract(address, ERC20_ABI as any, signer).transfer(to, raw)
      },
      /** Uses a consumable (potion, stamina vial, …) on a hero. */
      async consume(item: ItemDefinition, heroId: Id): Promise<ContractTransaction> {
        const address = item.addresses[chainId]
        if (!address) throw new Error(`${item.name} is not on ${chain.name}`)
        const consumer = contract('itemConsumer', ITEM_CONSUMER_ABI)
        if (item.standard === 'erc20') await ensureAllowance(address, consumer.address, 10n ** BigInt(item.decimals))
        return consumer.consumeItem(address, heroId.toString())
      },
    },
    tokens: {
      /** Sends a currency. `amount` is a decimal string (e.g. `"1.5"`) or a raw bigint. */
      async transfer(token: TokenDefinition, to: string, amount: Amount): Promise<ContractTransaction> {
        const address = token.addresses[chain.id]
        if (!address) throw new Error(`${token.symbol} is not on ${chain.name}`)
        const raw = toRaw(amount, token.decimals)
        if (address === NATIVE) return signer.sendTransaction({ to, value: raw }) as Promise<ContractTransaction>
        return new Contract(address, ERC20_ABI as any, signer).transfer(to, raw)
      },
      approve(token: TokenDefinition, spender: string, amount: Amount): Promise<ContractTransaction> {
        const address = token.addresses[chain.id]
        if (!address || address === NATIVE) throw new Error(`${token.symbol} is not an ERC-20 on ${chain.name}`)
        return new Contract(address, ERC20_ABI as any, signer).approve(spender, toRaw(amount, token.decimals))
      },
    },
    quests: {
      start({ heroIds, quest, attempts = 1, level, stat, gardenPoolId }: StartQuestOptions): Promise<ContractTransaction> {
        let type = 0
        if (quest === 'training') {
          if (!stat) throw new Error('Training quests need a `stat`')
          type = TRAINING_STATS.indexOf(stat)
        } else if (quest === 'gardening') {
          if (gardenPoolId === undefined) throw new Error('Gardening quests need a `gardenPoolId`')
          type = gardenPoolId
        }
        return contract('questCore', QUEST_CORE_ABI).startQuest(
          heroIds.map(String),
          QUEST_INSTANCES[quest],
          attempts,
          level ?? (quest === 'training' ? 1 : 0),
          type
        )
      },
      /** Completes the quest a hero is on (any hero of a group completes the whole group). */
      complete(heroId: Id): Promise<ContractTransaction> {
        return contract('questCore', QUEST_CORE_ABI).completeQuest(heroId.toString())
      },
      completeMany(heroIds: readonly Id[]): Promise<ContractTransaction> {
        return contract('questCore', QUEST_CORE_ABI).multiCompleteQuest(heroIds.map(String))
      },
      cancel(heroId: Id): Promise<ContractTransaction> {
        return contract('questCore', QUEST_CORE_ABI).cancelQuest(heroId.toString())
      },
    },
    /** Low-level helpers the actions above use, for flows the SDK doesn't wrap. */
    approvals: { ensureNftApproval, ensureAllowance },
  }
}

export type DFKWriter = ReturnType<typeof createDFKWriter>
