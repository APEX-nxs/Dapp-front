import React from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function App() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        height: "100vh",
        background: "#0f1117",
        color: "#fff",
        fontFamily: "sans-serif",
      }}
    >
      <h1 style={{ marginBottom: "20px" }}>🚀 My First Wagmi DApp</h1>
      <p style={{ marginBottom: "40px" }}>
        Connect your wallet to get started.
      </p>
      <ConnectButton />
    </div>
  );
}
