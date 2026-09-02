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
  /** Solo owner / listProfiles. No va en APIs públicas generales. */
  adoptionWhatsapp?: string | null;
  adoptionPhone?: string | null;
  createdAt: number;
}

export const PROFILE_LIMITS: Record<ProfileType, number> = {
  personal: 1,
  business: 2,
  protector: 2,
};

export const PROFILE_TYPE_LABEL: Record<ProfileType, string> = {
  personal: 'Perfil personal',
  business: 'Página empresarial',
  protector: 'Página de proteccionista/refugio',
};

/** Identidad administrada (empresa/refugio) = página. Cuenta/mascota = perfil. */
export function isManagedPageType(type: ProfileType | null | undefined): boolean {
  return type === 'business' || type === 'protector';
}

export function managedIdentityNoun(type: ProfileType | null | undefined): 'perfil' | 'página' {
  return isManagedPageType(type) ? 'página' : 'perfil';
}

export function editIdentityLabel(type: ProfileType | null | undefined): string {
  return isManagedPageType(type) ? 'Editar página' : 'Editar perfil';
}

export const PROFILE_TYPE_BADGE: Record<ProfileType, string | null> = {
  personal: null,
  business: '🏪 Tienda',
  protector: '❤️ Refugio',
};

export function countByType(profiles: PublicProfile[], type: ProfileType): number {
  return profiles.filter((p) => p.type === type).length;
}

export function limitMessage(type: Exclude<ProfileType, 'personal'>): string {
  if (type === 'business') return 'Ya alcanzaste el límite de 2 páginas empresariales.';
  return 'Ya alcanzaste el límite de 2 páginas de proteccionista.';
}
