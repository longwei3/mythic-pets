export const PET_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;

export type PetRarity = (typeof PET_RARITIES)[number];

export function normalizePetRarity(rawRarity: unknown): PetRarity {
  if (typeof rawRarity !== 'string') {
    return 'common';
  }

  const normalized = rawRarity.toLowerCase();
  if (normalized === 'mythic') {
    return 'legendary';
  }

  if ((PET_RARITIES as readonly string[]).includes(normalized)) {
    return normalized as PetRarity;
  }

  return 'common';
}
