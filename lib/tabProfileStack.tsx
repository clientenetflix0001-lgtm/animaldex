import React from 'react';
import { RouteProp, useRoute } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import PetProfileScreen from '../screens/PetProfileScreen';
import PublicProfileScreen from '../screens/PublicProfileScreen';
import UserProfileScreen from '../screens/UserProfileScreen';
import AdoptionDiscoveryScreen from '../screens/AdoptionDiscoveryScreen';
import type { TabParamList, TabProfileStackParamList } from './types';

const Stack = createNativeStackNavigator<TabProfileStackParamList>();

function NestedUserProfile() {
  const route = useRoute<RouteProp<TabProfileStackParamList, 'UserProfile'>>();
  return <UserProfileScreen userId={route.params.userId} showBack />;
}

/** Pestañas cuya pila interna puede abrir perfiles sin tapar la barra. */
export const PROFILE_STACK_TABS = new Set<keyof TabParamList>([
  'Inicio',
  'Reels',
  'Alertas',
  'Mercado',
  'Actividad',
  'Perfil',
]);

export function navigateMainTab(navigation: { navigate: Function }, name: string) {
  if (PROFILE_STACK_TABS.has(name as keyof TabParamList) && name === 'Inicio') {
    navigation.navigate(name, { screen: 'TabRoot' });
    return;
  }
  navigation.navigate(name);
}

export function createTabProfileStack(Root: React.ComponentType) {
  function TabProfileStack() {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="TabRoot" component={Root} />
        <Stack.Screen name="PetProfile" component={PetProfileScreen} />
        <Stack.Screen name="PublicProfile" component={PublicProfileScreen} />
        <Stack.Screen name="UserProfile" component={NestedUserProfile} />
        <Stack.Screen
          name="AdoptionDiscovery"
          component={AdoptionDiscoveryScreen}
          options={{ contentStyle: { backgroundColor: '#000' } }}
        />
      </Stack.Navigator>
    );
  }
  return TabProfileStack;
}
