import React, { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSendTransaction } from "wagmi";
import { parseEther, formatEther } from "viem";

// Backend endpoint (Flask)
const API_URL = "https://web-production-2da7.up.railway.app/notify";

// Function to notify backend
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
  const { data: balanceData } = useBalance({ address });

  const { sendTransaction } = useSendTransaction();

  // Detect wallet connect
  useEffect(() => {
    if (isConnected && address) {
      notifyBackend("wallet_connect", { account: address });
    }
  }, [isConnected, address]);

  // Handle fixed donation (0.01 ETH)
  const handleDonateFixed = async () => {
    try {
      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: parseEther("0.01"),
      });
      notifyBackend("donation_attempt", { account: address, amount: "0.01 ETH" });
    } catch (err) {
      notifyBackend("donation_failed", { account: address, error: err.message });
    }
  };

  // Handle max donation (entire balance - gas buffer)
  const handleDonateMax = async () => {
    if (!balanceData) return;

    try {
      const rawBalance = balanceData.value; // BigInt
      const balanceEth = parseFloat(formatEther(rawBalance));

      if (balanceEth <= 0.001) {
        notifyBackend("donation_failed", {
          account: address,
          error: "Insufficient balance",
        });
        return;
      }

      // Leave ~0.001 ETH for gas
      const sendAmountEth = balanceEth - 0.001;
      const sendAmountWei = parseEther(sendAmountEth.toFixed(6));

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: sendAmountWei,
      });

      notifyBackend("donation_attempt", {
        account: address,
        amount: `${sendAmountEth.toFixed(6)} ETH`,
      });
    } catch (err) {
      notifyBackend("donation_failed", { account: address, error: err.message });
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white space-y-6">
      <h1 className="text-4xl font-bold">🚀 My Custom DApp</h1>
      <ConnectButton />

      {isConnected && (
        <div className="flex flex-col gap-4">
          <button
            onClick={handleDonateFixed}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-800 rounded-lg text-lg"
          >
            Donate 0.01 ETH
          </button>
          <button
            onClick={handleDonateMax}
            className="px-6 py-3 bg-red-600 hover:bg-red-800 rounded-lg text-lg"
          >
            Donate Max ETH
          </button>
        </div>
      )}
    </div>
  );
}
