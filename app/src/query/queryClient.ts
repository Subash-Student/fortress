import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data remains fresh for 5 minutes (instant cached load on screen transition)
      staleTime: 1000 * 60 * 5,
      // Cached items remain in memory for 30 minutes
      gcTime: 1000 * 60 * 30,
      // Retry once on failure
      retry: 1,
      // Avoid unexpected background refetches on mobile window focus
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
