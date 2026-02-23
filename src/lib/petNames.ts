import type { TFunction } from 'i18next';

const STARTER_NAME_MAP: Record<string, string> = {
  'Fire Lob': 'dashboard.starterPets.fire',
  'Water Lob': 'dashboard.starterPets.water',
  '火焰龙虾': 'dashboard.starterPets.fire',
  '水灵龙虾': 'dashboard.starterPets.water',
};

const BABY_NAME_PATTERNS = [/^LobBaby(\d+)$/i, /^龙宝宝(\d+)$/, /^小龙龙(\d+)$/];

export function localizePetName(rawName: string | undefined, t: TFunction): string {
  if (!rawName) {
    return '';
  }

  const mappedKey = STARTER_NAME_MAP[rawName];
  if (mappedKey) {
    return t(mappedKey);
  }

  for (const pattern of BABY_NAME_PATTERNS) {
    const match = rawName.match(pattern);
    if (match) {
      return `${t('breed.babyNamePrefix')}${match[1]}`;
    }
  }

  return rawName;
}

