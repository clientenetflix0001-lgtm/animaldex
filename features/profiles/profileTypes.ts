export type ProfileType = 'personal' | 'business' | 'protector';

export interface PublicProfile {
  id: string;
  accountId: string;
  type: ProfileType;
  name: string;
  username: string;
  avatar: string | null;
  bio: string;
  location?: string;
  phone?: string;
  /** Localidad normalizada (mismo catálogo que Alertas/Mercado). Independiente de `location`. */
  locality?: string | null;
  createdAt: number;
}

export const PROFILE_LIMITS: Record<ProfileType, number> = {
  personal: 1,
  business: 2,
  protector: 2,
};

export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  personal: 'Personal',
  business: 'Tienda',
  protector: 'Proteccionista',
};

export const PROFILE_TYPE_BADGE: Record<ProfileType, string | null> = {
  personal: null,
  business: '🏪 Tienda',
  protector: '❤️ Refugio',
};

export function countByType(profiles: PublicProfile[], type: ProfileType): number {
  return profiles.filter((p) => p.type === type).length;
}

export function limitMessage(type: Exclude<ProfileType, 'personal'>): string {
  if (type === 'business') return 'Ya alcanzaste el límite de 2 perfiles empresariales.';
  return 'Ya alcanzaste el límite de 2 perfiles de proteccionista.';
}
