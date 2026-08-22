/**
 * Generic Query Key Factory for all Fortress modules
 * Ensures consistent cache keys across queries and mutations
 */
export const queryKeys = {
  // Vault / Passwords module
  vault: {
    all: ['vault'] as const,
    list: () => [...queryKeys.vault.all, 'list'] as const,
  },

  // Links module
  links: {
    all: ['links'] as const,
    list: (hidden: boolean = false) => [...queryKeys.links.all, 'list', { hidden }] as const,
    tags: () => [...queryKeys.links.all, 'tags'] as const,
  },

  // Future modules can easily be added here
  // notes: { all: ['notes'] as const, list: () => ... },
  // cards: { all: ['cards'] as const, list: () => ... },
};
