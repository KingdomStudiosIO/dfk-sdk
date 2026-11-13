/** Gene slot order inside the 48-character kai string, one trait per 4 characters. */
export const STAT_GENE_SLOTS = [
  'class',
  'subClass',
  'profession',
  'passive1',
  'passive2',
  'active1',
  'active2',
  'statBoost1',
  'statBoost2',
  'crafting1',
  'element',
  'crafting2',
] as const

export const VISUAL_GENE_SLOTS = [
  'gender',
  'headAppendage',
  'backAppendage',
  'background',
  'hairStyle',
  'hairColor',
  'visualUnknown1',
  'eyeColor',
  'skinColor',
  'appendageColor',
  'backAppendageColor',
  'visualUnknown2',
] as const

export type StatGeneSlot = (typeof STAT_GENE_SLOTS)[number]
export type VisualGeneSlot = (typeof VISUAL_GENE_SLOTS)[number]

export const HERO_CLASSES = {
  0: 'warrior',
  1: 'knight',
  2: 'thief',
  3: 'archer',
  4: 'priest',
  5: 'wizard',
  6: 'monk',
  7: 'pirate',
  8: 'berserker',
  9: 'seer',
  10: 'legionnaire',
  11: 'scholar',
  16: 'paladin',
  17: 'darkKnight',
  18: 'summoner',
  19: 'ninja',
  20: 'shapeshifter',
  21: 'bard',
  24: 'dragoon',
  25: 'sage',
  26: 'spellBow',
  28: 'dreadKnight',
} as const
export type HeroClass = (typeof HERO_CLASSES)[keyof typeof HERO_CLASSES]

/** Class tier, derived from the class gene id. */
export function getClassTier(classId: number): 'basic' | 'advanced' | 'elite' | 'exalted' {
  if (classId >= 28) return 'exalted'
  if (classId >= 24) return 'elite'
  if (classId >= 16) return 'advanced'
  return 'basic'
}

export const GENDERS = { 1: 'male', 3: 'female' } as const
export type Gender = (typeof GENDERS)[keyof typeof GENDERS]

export const PROFESSIONS = { 0: 'mining', 2: 'gardening', 4: 'fishing', 6: 'foraging' } as const
export type Profession = (typeof PROFESSIONS)[keyof typeof PROFESSIONS]

export const BACKGROUNDS = {
  0: 'desert',
  2: 'forest',
  4: 'plains',
  6: 'island',
  8: 'swamp',
  10: 'mountains',
  12: 'city',
  14: 'arctic',
} as const

export const STAT_BOOSTS = { 0: 'STR', 2: 'AGI', 4: 'INT', 6: 'WIS', 8: 'LCK', 10: 'VIT', 12: 'END', 14: 'DEX' } as const

export const ELEMENTS = {
  0: 'fire',
  2: 'water',
  4: 'earth',
  6: 'wind',
  8: 'lightning',
  10: 'ice',
  12: 'light',
  14: 'dark',
} as const

export const CRAFTING_PROFESSIONS = {
  0: 'Blacksmithing',
  2: 'Goldsmithing',
  4: 'Armorsmithing',
  6: 'Woodworking',
  8: 'Leatherworking',
  10: 'Tailoring',
  12: 'Enchanting',
  14: 'Alchemy',
} as const

/** Ability gene tier labels (Basic1..Exalted2). The raw id is kept alongside. */
export const ABILITY_TIERS: Record<number, string> = {
  ...Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, `Basic${i + 1}`])),
  ...Object.fromEntries(Array.from({ length: 8 }, (_, i) => [16 + i, `Advanced${i + 1}`])),
  ...Object.fromEntries(Array.from({ length: 4 }, (_, i) => [24 + i, `Elite${i + 1}`])),
  28: 'Exalted1',
  29: 'Exalted2',
}

export const ACTIVE_SKILLS = {
  0: 'Poisoned Blade',
  1: 'Blinding Winds',
  2: 'Heal',
  3: 'Cleanse',
  4: 'Iron Skin',
  5: 'Speed',
  6: 'Critical Aim',
  7: 'Deathmark',
  16: 'Exhaust',
  17: 'Daze',
  18: 'Explosion',
  19: 'Hardened Shield',
  24: 'Stun',
  25: 'Second Wind',
  28: 'Resurrection',
} as const

export const PASSIVE_SKILLS = {
  0: 'Duelist',
  1: 'Clutch',
  2: 'Foresight',
  3: 'Headstrong',
  4: 'Clear Vision',
  5: 'Fearless',
  6: 'Chatterbox',
  7: 'Stalwart',
  16: 'Leadership',
  17: 'Efficient',
  18: 'Menacing',
  19: 'Toxic',
  24: 'Giant Slayer',
  25: 'Last Stand',
  28: 'Second Life',
} as const

export const SKIN_COLORS = {
  0: 'c58135',
  2: 'f1ca9e',
  4: '985e1c',
  6: '57340c',
  8: 'e6a861',
  10: '7b4a11',
  12: 'e5ac91',
  14: 'aa5c38',
  16: '7db44f',
  18: '7786b8',
  20: 'd8d4d8',
  22: 'e03f3f',
  24: '6a3671',
} as const

export const HAIR_COLORS = {
  0: 'ab9159',
  1: 'af3853',
  2: '578761',
  3: '068483',
  4: '48321e',
  5: '66489e',
  6: 'ca93a7',
  7: '62a7e6',
  8: 'c34b1e',
  9: '326988',
  10: '513f4f',
  11: 'd48b41',
  16: 'd7bc65',
  17: '9b68ab',
  18: '8d6b3a',
  19: '566377',
  20: '275435',
  21: '77b23c',
  24: '880016',
  25: '353132',
  26: 'dbfbf5',
  28: '8f9bb3',
} as const

export const EYE_COLORS = {
  0: '203997',
  2: '896693',
  4: 'bb3f55',
  6: '0d7634',
  8: '8d7136',
  10: '613d8a',
  12: '2494a2',
  14: 'a41e12',
} as const

export const APPENDAGE_COLORS = {
  0: 'c5bfa7',
  1: 'a88b47',
  2: '58381e',
  3: '566f7d',
  4: '2a386d',
  5: '3f2e40',
  6: '830e18',
  7: '6f3a3c',
  8: 'cddef0',
  9: 'df7126',
  10: '835138',
  11: '86a637',
  16: '6b173c',
  17: 'a0304d',
  18: '78547c',
  19: '352a51',
  20: '147256',
  21: 'cf7794',
  24: 'c29d35',
  25: '211f1f',
  26: '77b5cf',
  28: 'd7d7d7',
} as const

export const MALE_HAIR_STYLES: Record<number, string> = {
  0: 'Battle Hawk',
  1: 'Wolf Mane',
  2: 'Enchanter',
  3: 'Wild Growth',
  4: 'Pixel',
  5: 'Sunrise',
  6: 'Bouffant',
  7: 'Agleam Spike',
  8: 'Wayfinder',
  9: 'Faded Topknot',
  10: 'Side Shave',
  11: 'Ronin',
  16: 'Gruff',
  17: 'Rogue Locs',
  18: 'Stone Cold',
  19: "Zinra's Tail",
  20: 'Hedgehog',
  21: 'Delinquent',
  24: 'Skegg',
  25: 'Shinobi',
  26: 'Sanjo',
  28: 'Perfect Form',
}

export const FEMALE_HAIR_STYLES: Record<number, string> = {
  0: 'Windswept',
  1: 'Fauna',
  2: 'Enchantress',
  3: 'Pineapple Top',
  4: 'Pixie',
  5: 'Darkweave Plait',
  6: 'Dejanira',
  7: 'Courtly Updo',
  8: 'Centaur tail',
  9: 'Lamia',
  10: 'Casual Ponytail',
  11: 'Wild Ponytail',
  16: 'Vogue Locs',
  17: 'Twin Vine Loops',
  18: 'Sweeping Willow',
  19: 'Odango',
  20: 'Goddess Locks',
  21: 'Lioness',
  24: 'Ethereal Waterfall',
  25: 'Kunoichi',
  26: 'Bowl Cut',
  28: 'Lunar Light Odango',
}

export const HEAD_APPENDAGES: Record<number, string> = {
  0: 'None',
  1: 'Kitsune Ears',
  2: 'Satyr Horns',
  3: 'Ram Horns',
  4: 'Imp Horns',
  5: 'Cat Ears',
  6: 'Minotaur Horns',
  7: 'Faun Horns',
  8: 'Draconic Horns',
  9: 'Fae Circlet',
  10: 'Ragfly Antennae',
  11: 'Royal Crown',
  16: 'Jagged Horns',
  17: 'Spindle Horns',
  18: 'Bear Ears',
  19: 'Antennae',
  20: 'Fallen Angel Coronet',
  21: 'Power Horn',
  24: 'Wood Elf Ears',
  25: 'Snow Elf Ears',
  26: 'Cranial Wings',
  28: 'Insight Jewel',
}

export const BACK_APPENDAGES: Record<number, string> = {
  0: 'None',
  1: 'Monkey Tail',
  2: 'Cat Tail',
  3: 'Imp Tail',
  4: 'Minotaur Tail',
  5: 'Daishō',
  6: 'Kitsune Tail',
  7: 'Zweihänder',
  8: 'Skeletal Wings',
  9: 'Skeletal Tail',
  10: 'Afflicted Spikes',
  11: "Traveler's Pack",
  16: 'Gryphon Wings',
  17: 'Draconic Wings',
  18: 'Butterfly Wings',
  19: 'Phoenix Wings',
  20: 'Fallen Angel',
  21: 'Crystal Wings',
  24: 'Aura of the Inner Grove',
  25: 'Ancient Orbs',
  26: 'Arachnid Legs',
  28: 'Cecaelia Tentacles',
}

export const RARITIES = ['common', 'uncommon', 'rare', 'legendary', 'mythic'] as const
export type Rarity = (typeof RARITIES)[number]

export const RARITY_COLORS: Record<Rarity, string> = {
  common: '#ffffff',
  uncommon: '#14C25A',
  rare: '#21CCFF',
  legendary: '#ffa32d',
  mythic: '#df5bff',
}

export const STAT_KEYS = [
  'strength',
  'intelligence',
  'wisdom',
  'luck',
  'agility',
  'vitality',
  'endurance',
  'dexterity',
] as const
export type StatKey = (typeof STAT_KEYS)[number]

export const STAT_ABBREVIATIONS: Record<StatKey, string> = {
  strength: 'STR',
  intelligence: 'INT',
  wisdom: 'WIS',
  luck: 'LCK',
  agility: 'AGI',
  vitality: 'VIT',
  endurance: 'END',
  dexterity: 'DEX',
}

/** Hero ids are offset per realm; ids above each threshold were minted in that realm. */
export const REALM_ID_OFFSETS = {
  sunderedisles: 500_000_000_000n,
  crystalvale: 1_000_000_000_000n,
  serendale2: 2_000_000_000_000n,
  avalanche: 3_000_000_000_000n,
} as const
