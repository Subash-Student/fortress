import { Href } from "expo-router";
import { ImageSourcePropType } from "react-native";

export interface AppModule {
  id: string;
  name: string;
  route: Href;
  icon: ImageSourcePropType;
  description: string;
}

export const MODULES: AppModule[] = [
  {
    id: "vault",
    name: "Vault",
    route: "/vault",
    icon: require("../../assets/module_logos/vault.png"),
    description: "Secure passwords and credentials manager",
  },
  {
    id: "links",
    name: "Links",
    route: "/links",
    icon: require("../../assets/module_logos/links.png"),
    description: "Encrypted personal bookmarks and links",
  },
];
