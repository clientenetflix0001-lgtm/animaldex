// Helper: obtiene los datos de presentación de un post,
// ya sea real (base de datos) o demo (generado).
import { Post, getPet, getOwner, petAvatar, SPECIES_LABEL, Species, PETS } from './data';
import { petFallbackAvatar } from './images';

export interface PostDisplay {
  petName: string;
  petEmoji: string;
  avatarUri: string;
  username: string;
  speciesLabel: string;
  isRealPet: boolean;
}

export function isDemoPetId(petId: string): boolean {
  return PETS.some((p) => p.id === petId);
}

export function getPostDisplay(post: Post): PostDisplay {
  if (post.real) {
    return {
      petName: post.petName ?? 'Mascota',
      petEmoji: post.petEmoji ?? '🐾',
      avatarUri: post.petAvatarUrl ?? petFallbackAvatar(post.petId),
      username: post.username ?? 'usuario',
      speciesLabel:
        SPECIES_LABEL[(post.petSpecies as Species) ?? 'perro'] ??
        (post.petSpecies ? post.petSpecies.charAt(0).toUpperCase() + post.petSpecies.slice(1) : 'Mascota'),
      isRealPet: true,
    };
  }
  const pet = getPet(post.petId);
  const owner = getOwner(pet);
  return {
    petName: pet.name,
    petEmoji: pet.emoji,
    avatarUri: petAvatar(pet),
    username: owner.username,
    speciesLabel: SPECIES_LABEL[pet.species],
    isRealPet: false,
  };
}
