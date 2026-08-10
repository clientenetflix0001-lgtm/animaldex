import React from 'react';
import { View, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme, RouteProp, LinkingOptions } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute } from '@react-navigation/native';

import FeedScreen from './screens/FeedScreen';
import ExploreScreen from './screens/ExploreScreen';
import CreatePostScreen from './screens/CreatePostScreen';
import ActivityScreen from './screens/ActivityScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import PetProfileScreen from './screens/PetProfileScreen';
import PostDetailScreen from './screens/PostDetailScreen';
import VerifyPhoneScreen from './screens/VerifyPhoneScreen';
import AuthScreen from './screens/AuthScreen';
import AddPetScreen from './screens/AddPetScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import QRScannerScreen from './screens/QRScannerScreen';

import { StoreProvider, useStore } from './lib/store';
import { NotificationsProvider, useNotifications } from './lib/realtime';
import { colors } from './lib/theme';
import { RootStackParamList, TabParamList } from './lib/types';
import { useBreakpoint } from './lib/responsive';
import { Sidebar } from './components/Sidebar';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

function MyProfileTab() {
  return <UserProfileScreen showBack={false} />;
}

function UserProfileRoute() {
  const route = useRoute<RouteProp<RootStackParamList, 'UserProfile'>>();
  return <UserProfileScreen userId={route.params.userId} showBack />;
}

const TAB_ICONS: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { on: 'home', off: 'home-outline' },
  Explorar: { on: 'compass', off: 'compass-outline' },
  Crear: { on: 'add-circle', off: 'add-circle-outline' },
  Actividad: { on: 'heart', off: 'heart-outline' },
  Perfil: { on: 'person', off: 'person-outline' },
};

function Tabs() {
  const { desktopWeb, sidebarMode, sidebarWidth } = useBreakpoint();
  const { unread } = useNotifications();
  const insets = useSafeAreaInsets();
  // Altura base del tab bar + espacio real de la barra de sistema de Android
  // (botones Volver/Inicio/Cambiar app, o el gesto de swipe-up), para que
  // nunca quede tapado por la navegación del sistema. En web no hay barra
  // de sistema que cubrir, así que mantenemos la altura fija de siempre.
  const baseTabBarHeight = 56;
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const tabBarStyleWithInsets =
    Platform.OS === 'web'
      ? styles.tabBar
      : {
          ...styles.tabBar,
          height: baseTabBarHeight + bottomInset + 6,
          paddingBottom: bottomInset + 6,
        };

  // ---------- Escritorio (web ≥ 1024px): sidebar estilo Instagram ----------
  if (desktopWeb) {
    return (
      <Tab.Navigator
        tabBar={(props) => <Sidebar {...(props as any)} mode={sidebarMode === 'full' ? 'full' : 'rail'} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { paddingLeft: sidebarWidth, backgroundColor: colors.bg },
        }}
      >
        <Tab.Screen name="Inicio" component={FeedScreen} />
        <Tab.Screen name="Explorar" component={ExploreScreen} />
        <Tab.Screen name="Crear" component={CreatePostScreen} />
        <Tab.Screen name="Actividad" component={ActivityScreen} />
        <Tab.Screen name="Perfil" component={MyProfileTab} />
      </Tab.Navigator>
    );
  }

  // ---------- Móvil / tablet: bottom tabs (sin cambios) ----------
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: tabBarStyleWithInsets,
        tabBarLabelStyle: styles.tabLabel,
        tabBarIcon: ({ focused, color }) => {
          const icons = TAB_ICONS[route.name];
          const size = route.name === 'Crear' ? 32 : 24;
          return (
            <Ionicons
              name={focused ? icons.on : icons.off}
              size={size}
              color={route.name === 'Crear' ? colors.primary : color}
            />
          );
        },
      })}
    >
      <Tab.Screen name="Inicio" component={FeedScreen} />
      <Tab.Screen name="Explorar" component={ExploreScreen} />
      <Tab.Screen name="Crear" component={CreatePostScreen} options={{ tabBarLabel: '' }} />
      <Tab.Screen
        name="Actividad"
        component={ActivityScreen}
        options={{
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.heart, fontSize: 10, fontWeight: '700' },
        }}
      />
      <Tab.Screen name="Perfil" component={MyProfileTab} />
    </Tab.Navigator>
  );
}

const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ['animaldex://'],
  config: {
    screens: {
      Tabs: {
        path: '',
        screens: {
          Inicio: '',
          Explorar: 'explorar',
          Crear: 'crear',
          Actividad: 'actividad',
          Perfil: 'perfil',
        },
      },
      PostDetail: 'p/:postId',
      PetProfile: 'pet/:petId',
      UserProfile: 'user/:userId',
      VerifyPhone: 'verificar',
      AddPet: 'nueva-mascota',
      EditProfile: 'editar-perfil',
      QRScanner: 'escanear',
      Auth: 'entrar',
    },
  },
};

const screenHeaderOptions = {
  headerBackTitle: 'Atrás',
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800' as const, color: colors.text },
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
};

function RootNavigator() {
  const { user, authReady } = useStore();

  if (!authReady) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen name="PetProfile" component={PetProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileRoute} options={{ headerShown: false }} />
      <Stack.Screen
        name="PostDetail"
        component={PostDetailScreen}
        options={{ title: 'Publicación', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="VerifyPhone"
        component={VerifyPhoneScreen}
        options={{ title: 'Verificación SMS', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="AddPet"
        component={AddPetScreen}
        options={{ title: 'Nueva mascota', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Editar perfil', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.card,
    primary: colors.primary,
    text: colors.text,
    border: colors.border,
  },
};

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StoreProvider>
          <NotificationsProvider>
          <NavigationContainer
            theme={navTheme}
            linking={linking}
            documentTitle={{
              formatter: () => 'Animaldex · La red social de tus mascotas 🐾',
            }}
          >
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
          </NotificationsProvider>
        </StoreProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.card,
    borderTopColor: colors.border,
    borderTopWidth: 0.5,
    height: Platform.OS === 'web' ? 64 : undefined,
    paddingTop: 6,
    // height y paddingBottom reales se calculan en Tabs() con
    // useSafeAreaInsets() para no quedar tapados por la barra
    // de navegación de Android (Volver / Inicio / Cambiar app).
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
});
