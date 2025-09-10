import React from "react";
import ReactDOM from "react-dom/client";
import { WagmiProvider, http } from "wagmi";
import { mainnet, sepolia } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
} from "@rainbow-me/rainbowkit";
import App from "./App";
import "@rainbow-me/rainbowkit/styles.css";

// Query client for react-query
const queryClient = new QueryClient();

// Wagmi + RainbowKit config
const config = getDefaultConfig({
  appName: "My Wagmi Dapp",
  projectId: "cca138ec358ef45f4e07e49475be2cd7", // <-- your WalletConnect project ID
  chains: [mainnet, sepolia],
  transports: {
    [mainnet.id]: http(),
    [sepolia.id]: http(),
  },
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme()} modalSize="compact">
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
);
