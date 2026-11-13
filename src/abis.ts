export {
  HERO_CORE_ABI,
  HERO_AUCTION_ABI,
  PVP_CORE_ABI,
  PROFILES_ABI,
  PET_CORE_ABI,
  PET_AUCTION_ABI,
  WEAPON_CORE_ABI,
  ARMOR_CORE_ABI,
  ACCESSORY_CORE_ABI,
  EQUIPMENT_AUCTION_ABI,
  QUEST_CORE_ABI,
  ITEM_CONSUMER_ABI,
} from './generated/abis'

export const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
  'function name() view returns (string)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
] as const

export const ERC1155_ABI = [
  'function balanceOf(address account, uint256 id) view returns (uint256)',
  'function balanceOfBatch(address[] accounts, uint256[] ids) view returns (uint256[])',
  'function uri(uint256 id) view returns (string)',
  'function isApprovedForAll(address account, address operator) view returns (bool)',
  'function setApprovalForAll(address operator, bool approved)',
  'function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)',
] as const

/** Shared by Multicall2 (the game's deployment) and Multicall3. */
export const MULTICALL_ABI = [
  'function tryAggregate(bool requireSuccess, tuple(address target, bytes callData)[] calls) returns (tuple(bool success, bytes returnData)[] returnData)',
  'function getEthBalance(address addr) view returns (uint256 balance)',
] as const
