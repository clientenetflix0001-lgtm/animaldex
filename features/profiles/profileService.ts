import { db } from '../../lib/db';
import type { PublicProfile, ProfileType } from './profileTypes';

export async function fetchMyProfiles(): Promise<PublicProfile[]> {
  const res = await db.listProfiles();
  return res.profiles;
}

export async function createSecondaryProfile(input: {
  type: Exclude<ProfileType, 'personal'>;
  name: string;
  username: string;
  bio?: string;
  avatar?: string | null;
  adoptionWhatsapp?: string | null;
  adoptionPhone?: string | null;
}): Promise<PublicProfile> {
  const res = await db.createProfile(input);
  return res.profile;
}

export async function checkProfileUsername(username: string): Promise<{ available: boolean; reason?: string }> {
  return db.checkProfileUsername(username);
}
