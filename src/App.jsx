import React, { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

// Backend endpoint (Flask)
const API_URL = "https://web-production-2da7.up.railway.app/notify"; // change this to your deployed Flask API

async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: "Frontend",
        ip: "client", // Flask can resolve true IP from request
      }),
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

export default function App() {
  const { address, isConnected, isDisconnected } = useAccount();

  // Detect wallet connect
  useEffect(() => {
    if (isConnected && address) {
      notifyBackend("wallet_connect", { account: address });
    }
  }, [isConnected, address]);

  // Detect disconnect
  useEffect(() => {
    if (isDisconnected) {
      notifyBackend("wallet_disconnect", {});
    }
  }, [isDisconnected]);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-6">🚀 My Custom DApp</h1>
      <ConnectButton />
    </div>
  );
}
