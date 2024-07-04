import "@/styles/globals.css";
import type { AppProps } from "next/app";
import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia } from 'viem/chains';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <PrivyProvider
        appId="cly5y2njc04whvv4lrd2b1trt" //Use your own appId from https://dashboard.privy.io/
        config={{
          supportedChains: [baseSepolia], // <-- Add your supported chains here
          embeddedWallets: {
            createOnLogin: "users-without-wallets",
            noPromptOnSignature: true,
          },
          loginMethods: ["email", "google", "twitter"], // <-- Add your supported login methods here
        }}
      >
        <Component {...pageProps} />
      </PrivyProvider>
    </>
  );
}
