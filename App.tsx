import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Platform, ActivityIndicator, Linking, Pressable, StatusBar as RNStatusBar } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DefaultTheme,
  RouteProp,
  LinkingOptions,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider, useSafeAreaInsets, initialWindowMetrics } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useRoute } from '@react-navigation/native';

import ExploreScreen from './screens/ExploreScreen';
import CreatePostScreen from './screens/CreatePostScreen';
import ActivityScreen from './screens/ActivityScreen';
import UserProfileScreen from './screens/UserProfileScreen';
import PublicProfileScreen from './screens/PublicProfileScreen';
import EditPublicProfileScreen from './screens/EditPublicProfileScreen';
import PetProfileScreen from './screens/PetProfileScreen';
import PostDetailScreen from './screens/PostDetailScreen';
import VerifyPhoneScreen from './screens/VerifyPhoneScreen';
import AuthScreen from './screens/AuthScreen';
import AddPetScreen from './screens/AddPetScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import QRScannerScreen from './screens/QRScannerScreen';
import TagWelcomeScreen from './screens/TagWelcomeScreen';
import AdminTagsScreen from './screens/AdminTagsScreen';
import AlertsScreen from './screens/AlertsScreen';
import CreateAlertScreen from './screens/CreateAlertScreen';
import AlertDetailScreen from './screens/AlertDetailScreen';
import FeedReelsSwiper from './screens/FeedReelsSwiper';
import MarketScreen from './screens/MarketScreen';
import CreateListingScreen from './screens/CreateListingScreen';
import ListingDetailScreen from './screens/ListingDetailScreen';
import SellerShopScreen from './screens/SellerShopScreen';
import MarketFavoritesScreen from './screens/MarketFavoritesScreen';

import { StoreProvider, useStore } from './lib/store';
import { NotificationsProvider, useNotifications } from './lib/realtime';
import { ProfileProvider } from './features/profiles';
import { colors } from './lib/theme';
import { RootStackParamList, TabParamList } from './lib/types';
import { useBreakpoint } from './lib/responsive';
import { Sidebar } from './components/Sidebar';
import { extractTagCode } from './lib/tags';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

// Ref global de navegación: permite navegar desde fuera del árbol de
// componentes (por ejemplo, al detectar un deep link ?qr=xx antes de
// que el usuario haya iniciado sesión).
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

function MyProfileTab() {
  return <UserProfileScreen showBack={false} />;
}

function UserProfileRoute() {
  const route = useRoute<RouteProp<RootStackParamList, 'UserProfile'>>();
  return <UserProfileScreen userId={route.params.userId} showBack />;
}

const TAB_ICONS: Record<keyof TabParamList, { on: keyof typeof Ionicons.glyphMap; off: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { on: 'home', off: 'home-outline' },
  Reels: { on: 'film', off: 'film-outline' },
  Alertas: { on: 'warning', off: 'warning-outline' },
  Mercado: { on: 'storefront', off: 'storefront-outline' },
  Crear: { on: 'add-circle', off: 'add-circle-outline' },
  Actividad: { on: 'heart', off: 'heart-outline' },
  Perfil: { on: 'person', off: 'person-outline' },
};

const MOBILE_TAB_ORDER: (keyof TabParamList)[] = [
  'Inicio',
  'Reels',
  'Alertas',
  'Crear',
  'Mercado',
  'Perfil',
];

function MobileTabBar({ state, navigation }: { state: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'web' ? 0 : insets.bottom;
  const focusedName = state.routes[state.index]?.name as keyof TabParamList;

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: 56 + bottomInset + 6,
          paddingBottom: bottomInset + 6,
          flexDirection: 'row',
        },
      ]}
    >
      {MOBILE_TAB_ORDER.map((name) => {
        const focused = focusedName === name;
        const icons = TAB_ICONS[name];
        const size = name === 'Crear' ? 32 : 24;
        return (
          <Pressable
            key={name}
            onPress={() => navigation.navigate(name)}
            style={styles.tabItem}
            accessibilityRole="button"
            accessibilityLabel={name === 'Crear' ? 'Crear' : name}
          >
            <Ionicons
              name={focused ? icons.on : icons.off}
              size={size}
              color={name === 'Crear' ? colors.primary : focused ? colors.primary : colors.textMuted}
            />
            {name !== 'Crear' && (
              <Text style={[styles.tabLabel, { color: focused ? colors.primary : colors.textMuted }]}>
                {name}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

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
        <Tab.Screen name="Inicio">{() => <FeedReelsSwiper initialPage={0} />}</Tab.Screen>
        <Tab.Screen name="Reels">{() => <FeedReelsSwiper initialPage={1} />}</Tab.Screen>
        <Tab.Screen name="Alertas" component={AlertsScreen} />
        <Tab.Screen name="Mercado" component={MarketScreen} />
        <Tab.Screen name="Crear" component={CreatePostScreen} />
        <Tab.Screen name="Actividad" component={ActivityScreen} />
        <Tab.Screen name="Perfil" component={MyProfileTab} />
      </Tab.Navigator>
    );
  }

  // ---------- Móvil / tablet ----------
  // Barra visible: Inicio | Reels | Alertas | + | Mercado | Perfil
  // Actividad sigue registrada (misma pantalla) pero NO se muestra abajo.
  return (
    <Tab.Navigator
      tabBar={(props) => <MobileTabBar state={props.state} navigation={props.navigation} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Inicio">{() => <FeedReelsSwiper initialPage={0} />}</Tab.Screen>
      <Tab.Screen name="Reels">{() => <FeedReelsSwiper initialPage={1} />}</Tab.Screen>
      <Tab.Screen name="Alertas" component={AlertsScreen} />
      <Tab.Screen name="Crear" component={CreatePostScreen} />
      <Tab.Screen name="Mercado" component={MarketScreen} />
      <Tab.Screen name="Perfil" component={MyProfileTab} />
      <Tab.Screen name="Actividad" component={ActivityScreen} />
    </Tab.Navigator>
  );
}

const linking: LinkingOptions<RootStackParamList> = {
  // `animaldex://` (esquema propio, no se toca) + el dominio HTTPS público.
  // El prefijo HTTPS permite que un Android App Link verificado
  // (https://animaldex-web.pages.dev/p/<id>) abra la app y resuelva la
  // misma configuración de rutas de abajo (p/:postId, pet/:petId, etc.).
  prefixes: ['animaldex://', 'https://animaldex-web.pages.dev'],
  config: {
    screens: {
      Tabs: {
        path: '',
        screens: {
          Inicio: '',
          Reels: 'reels',
          Alertas: 'alertas',
          Mercado: 'mercado',
          Crear: 'crear',
          Actividad: 'actividad',
          Perfil: 'perfil',
        },
      },
      Explorar: 'explorar',
      PostDetail: 'p/:postId',
      PetProfile: 'pet/:petId',
      UserProfile: 'user/:userId',
      PublicProfile: ':username',
      EditPublicProfile: 'editar-perfil-publico',
      VerifyPhone: 'verificar',
      AddPet: 'nueva-mascota',
      EditProfile: 'editar-perfil',
      QRScanner: 'escanear',
      AdminTags: 'admin/chapitas',
      CreateAlert: 'crear-alerta',
      AlertDetail: 'a/:alertId',
      CreateListing: 'vender',
      ListingDetail: 'm/:listingId',
      SellerShop: 'tienda/:userId',
      MarketFavorites: 'mercado-favoritos',
      Auth: 'entrar',
    },
  },
};

// ============================================================
// Chapitas QR: detecta el par\u00e1metro ?qr=<code> en cualquier URL con la
// que se abra la app (deep link, o la propia URL del navegador en web),
// y lo guarda como "pendiente". Cuando el usuario est\u00e9 autenticado
// (ya sea porque ya lo estaba, o justo despu\u00e9s de registrarse/iniciar
// sesi\u00f3n), navega autom\u00e1ticamente a la pantalla de bienvenida de la
// chapita, UNA sola vez.
// ============================================================
function TagDeepLinkHandler() {
  const { user, authReady, pendingTagCode, setPendingTagCode } = useStore();
  const handledRef = useRef(false);

  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      const code = extractTagCode(url);
      if (code != null) setPendingTagCode(code);
    });
    const sub = Linking.addEventListener('url', ({ url }) => {
      const code = extractTagCode(url);
      if (code != null) setPendingTagCode(code);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!authReady || !user || pendingTagCode == null || handledRef.current) return;
    handledRef.current = true;
    const code = pendingTagCode;
    setPendingTagCode(null);

    const tryNavigate = () => {
      if (navigationRef.isReady()) {
        navigationRef.navigate('TagWelcome', { code });
      } else {
        setTimeout(tryNavigate, 100);
      }
    };
    tryNavigate();
  }, [authReady, user, pendingTagCode, setPendingTagCode]);

  return null;
}

const screenHeaderOptions = {
  headerBackTitle: 'Atrás',
  headerTintColor: colors.text,
  headerTitleStyle: { fontWeight: '800' as const, color: colors.text },
  headerStyle: { backgroundColor: colors.bg },
  headerShadowVisible: false,
};

// Navegador para visitantes SIN sesión. Permite ver recursos públicos
// abiertos desde un enlace compartido sin cuenta: /p/:id, /user/:id,
// /:handle, /pet/:handle y /a/:id. Cualquier otra ruta cae en Auth.
function PublicNavigator() {
  return (
    <Stack.Navigator initialRouteName="Auth">
      <Stack.Screen name="Auth" component={AuthScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PostDetail" component={PostDetailScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileRoute} options={{ headerShown: false }} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PetProfile" component={PetProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="AlertDetail"
        component={AlertDetailScreen}
        options={{ title: 'Alerta', ...screenHeaderOptions }}
      />
    </Stack.Navigator>
  );
}

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
    return <PublicNavigator />;
  }

  return (
    <Stack.Navigator>
      <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
      <Stack.Screen
        name="Explorar"
        component={ExploreScreen}
        options={{ title: 'Explorar', ...screenHeaderOptions }}
      />
      <Stack.Screen name="PetProfile" component={PetProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="UserProfile" component={UserProfileRoute} options={{ headerShown: false }} />
      <Stack.Screen name="PublicProfile" component={PublicProfileScreen} options={{ headerShown: false }} />
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
        name="EditPublicProfile"
        component={EditPublicProfileScreen}
        options={{ title: 'Editar perfil', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{ headerShown: false, presentation: 'modal', animation: 'slide_from_bottom' }}
      />
      <Stack.Screen
        name="TagWelcome"
        component={TagWelcomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AdminTags"
        component={AdminTagsScreen}
        options={{ title: 'Chapitas QR', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="CreateAlert"
        component={CreateAlertScreen}
        options={{ title: 'Crear alerta', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="AlertDetail"
        component={AlertDetailScreen}
        options={{ title: 'Alerta', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="CreateListing"
        component={CreateListingScreen}
        options={{ title: 'Vender', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="ListingDetail"
        component={ListingDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="SellerShop"
        component={SellerShopScreen}
        options={{ title: 'Tienda', ...screenHeaderOptions }}
      />
      <Stack.Screen
        name="MarketFavorites"
        component={MarketFavoritesScreen}
        options={{ title: 'Favoritos', ...screenHeaderOptions }}
      />
    </Stack.Navigator>
  );
}

// En Android, initialWindowMetrics suele ser null / top:0 en el primer
// tick de JS. StatusBar.currentHeight es la altura real de la barra de
// estado y está disponible de forma síncrona. Lo usamos como semilla
// para que SafeAreaView no pinte el header debajo del reloj.
function initialSafeAreaMetrics() {
  const native = initialWindowMetrics;
  const androidTop = Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0;
  return {
    frame: native?.frame ?? { x: 0, y: 0, width: 0, height: 0 },
    insets: {
      top: Math.max(native?.insets.top ?? 0, androidTop),
      left: native?.insets.left ?? 0,
      right: native?.insets.right ?? 0,
      bottom: native?.insets.bottom ?? 0,
    },
  };
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

  // SafeAreaProvider tiene que montarse en el primer frame, con las métricas
  // nativas ya conocidas. Si se monta DESPUÉS de useFonts, el primer paint
  // del header usa insets.top = 0 (pegado al reloj) y un instante después
  // baja al padding correcto. initialWindowMetrics evita ese salto.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialSafeAreaMetrics()}>
        {!fontsLoaded ? (
          <View style={{ flex: 1, backgroundColor: colors.bg }} />
        ) : (
          <StoreProvider>
            <ProfileProvider>
            <NotificationsProvider>
              <NavigationContainer
                ref={navigationRef}
                theme={navTheme}
                linking={linking}
                documentTitle={{
                  formatter: () => 'Animaldex · La red social de tus mascotas 🐾',
                }}
              >
                <StatusBar style="dark" />
                <TagDeepLinkHandler />
                <RootNavigator />
              </NavigationContainer>
            </NotificationsProvider>
            </ProfileProvider>
          </StoreProvider>
        )}
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
    fontSize: 9,
    fontWeight: '600',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
