import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import App from "./App";
import "./index.css";
import "./i18n";
import { useApiHealthStore } from "./store/apiHealthStore";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false, // les retries réseau sont déjà gérés côté Rust (rate limiter + backoff)
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
  // Alimente le badge d'état de connexion API permanent dans TopNav (voir apiHealthStore) —
  // point d'observation global unique plutôt que de dupliquer la logique dans chaque hook.
  queryCache: new QueryCache({
    onError: (error) => useApiHealthStore.getState().reportError(error),
    onSuccess: () => useApiHealthStore.getState().reportSuccess(),
  }),
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
