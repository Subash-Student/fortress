import { Href } from 'expo-router';

export interface AppModule {
  id: string;
  name: string;
  route: Href;
  icon: string; // Emoji representing the app module
  description: string;
}

export const MODULES: AppModule[] = [
  {
    id: 'vault',
    name: 'Vault',
    route: '/vault',
    icon: 'https://cdn-icons-png.flaticon.com/512/1804/1804429.png',
    description: 'Secure passwords and credentials manager',
  },
  {
    id: 'links',
    name: 'Links',
    route: '/links',
    icon: 'https://cdn-icons-png.flaticon.com/512/9872/9872434.png',
    description: 'Encrypted personal bookmarks and links',
  },
];
