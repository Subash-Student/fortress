import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vaultApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { decrypt } from '../crypto/encryption';
import { queryKeys } from '../query/keys';

export interface CredentialAccount {
  id: string;
  username: string;
  password: string;
  showPassword?: boolean;
}

export interface VaultPlatform {
  id: string;
  name: string;
  logo: string;
  accounts: CredentialAccount[];
}

/**
 * Hook to fetch and decrypt Vault Platforms with automatic caching
 */
export function useVaultPlatforms() {
  const { vaultKey } = useAuthStore();

  return useQuery<VaultPlatform[]>({
    queryKey: queryKeys.vault.list(),
    queryFn: async () => {
      const res = await vaultApi.getPlatforms();
      const rawPlatforms = res.data || [];

      return rawPlatforms.map((plat: any) => {
        return {
          id: plat.id || plat._id,
          name: plat.name,
          logo: plat.logo,
          accounts: (plat.accounts || []).map((acc: any) => {
            let username = '';
            let password = '';

            try {
              if (vaultKey) {
                username = decrypt(acc.username.ciphertext, acc.username.iv, vaultKey);
                password = decrypt(acc.password.ciphertext, acc.password.iv, vaultKey);
              }
            } catch (err) {
              console.error('Decryption failed for account', acc._id, err);
            }

            return {
              id: acc.id || acc._id,
              username,
              password,
              showPassword: false,
            };
          }),
        };
      });
    },
    enabled: !!vaultKey,
  });
}

/**
 * Hook for Vault Platform Mutations (Save, Update, Delete)
 */
export function useVaultMutations() {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data: { name: string; logo: string; accounts: any[] }) =>
      vaultApi.savePlatform(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name: string; logo: string; accounts: any[] } }) =>
      vaultApi.updatePlatform(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => vaultApi.deletePlatform(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.vault.all });
    },
  });

  return {
    savePlatform: saveMutation.mutateAsync,
    updatePlatform: updateMutation.mutateAsync,
    deletePlatform: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
}
