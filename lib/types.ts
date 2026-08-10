export type RootStackParamList = {
  Auth: undefined;
  Tabs: undefined;
  PetProfile: { petId: string };
  UserProfile: { userId: string };
  PostDetail: { postId: string; d?: string };
  VerifyPhone: undefined;
  AddPet: { tagCode?: number } | undefined;
  EditProfile: undefined;
  QRScanner: undefined;
  TagWelcome: { code: number };
  AdminTags: undefined;
};

export type TabParamList = {
  Inicio: undefined;
  Explorar: undefined;
  Crear: undefined;
  Actividad: undefined;
  Perfil: undefined;
};
