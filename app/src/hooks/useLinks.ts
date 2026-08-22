import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { linksApi } from '../api/client';
import { useAuthStore } from '../store/authStore';
import { decrypt } from '../crypto/encryption';
import { queryKeys } from '../query/keys';

export interface LinkItem {
  _id: string;
  url: string;
  title: string;
  thumbnail: string;
  tags?: string[];
  isFavorite: boolean;
  isHidden: boolean;
  createdAt: string;
}

/**
 * Hook to fetch and decrypt Links with automatic caching by hidden state.
 * Strictly enforces that non-hidden queries NEVER contain hidden links.
 */
export function useLinksQuery(showHidden: boolean = false) {
  const { vaultKey } = useAuthStore();

  return useQuery<LinkItem[]>({
    queryKey: queryKeys.links.list(showHidden),
    queryFn: async () => {
      const res = await linksApi.getLinks(showHidden);
      const rawLinks = res.data || [];

      const decrypted = rawLinks.map((item: any) => {
        if (!vaultKey) return item;
        try {
          return {
            ...item,
            url: item.url?.ciphertext ? decrypt(item.url.ciphertext, item.url.iv, vaultKey) : item.url,
            title: item.title?.ciphertext ? decrypt(item.title.ciphertext, item.title.iv, vaultKey) : item.title,
            thumbnail: item.thumbnail?.ciphertext ? decrypt(item.thumbnail.ciphertext, item.thumbnail.iv, vaultKey) : item.thumbnail,
          };
        } catch (err) {
          console.error('Failed to decrypt link:', item._id, err);
          return item;
        }
      });

      // Strict security barrier:
      // When showHidden is false, strictly eliminate any hidden item (even if backend returned it).
      // When showHidden is true, strictly return only hidden items.
      return decrypted.filter((item: LinkItem) => (showHidden ? item.isHidden === true : !item.isHidden));
    },
    enabled: !!vaultKey,
  });
}

/**
 * Hook to fetch saved user tags with caching
 */
export function useLinkTagsQuery() {
  return useQuery<string[]>({
    queryKey: queryKeys.links.tags(),
    queryFn: async () => {
      const res = await linksApi.getUserTags();
      return Array.isArray(res.data?.tags) ? res.data.tags : [];
    },
  });
}

/**
 * Hook for Links Mutations (Save, Update, Toggle Favorite, Toggle Hide, Delete)
 */
export function useLinksMutations() {
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (data: {
      url: any;
      title: any;
      thumbnail: any;
      tags: string[];
      isFavorite: boolean;
      isHidden: boolean;
    }) => linksApi.saveLink(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        url: any;
        title: any;
        thumbnail: any;
        tags: string[];
        isFavorite: boolean;
        isHidden: boolean;
      };
    }) => linksApi.updateLink(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });

  const toggleFavoriteMutation = useMutation({
    mutationFn: ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      linksApi.toggleFavorite(id, isFavorite),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });

  const toggleHideMutation = useMutation({
    mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
      linksApi.toggleHide(id, isHidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => linksApi.deleteLink(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.links.all });
    },
  });

  return {
    saveLink: saveMutation.mutateAsync,
    updateLink: updateMutation.mutateAsync,
    toggleFavorite: toggleFavoriteMutation.mutateAsync,
    toggleHide: toggleHideMutation.mutateAsync,
    deleteLink: deleteMutation.mutateAsync,
    isSaving: saveMutation.isPending || updateMutation.isPending,
  };
}
