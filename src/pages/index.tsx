import React, { useState } from "react";
import {
  createSmartAccountClient,
  BiconomySmartAccountV2,
  PaymasterMode,
} from "@biconomy/account";
import { baseSepolia } from "viem/chains";
import { ConnectedWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Interface } from "ethers/lib/utils";


export default function Home() {
  const [smartAccount, setSmartAccount] =
    useState<BiconomySmartAccountV2 | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>()
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [txnHash, setTxnHash] = useState<string | null>(null);
  const [chainSelected, setChainSelected] = useState<number>(0);
  const { login } = usePrivy();
  const { wallets } = useWallets(); // https://docs.privy.io/guide/react/wallets/use-wallets#usewallets-vs-useprivy

  const chains = [
    {
      chainId: baseSepolia.id,
      name: baseSepolia.name,
      providerUrl: baseSepolia.rpcUrls.default.http[0],
      biconomyPaymasterApiKey: "izhDj8Kmh.401d1ce8-104f-4e86-948d-052430ddd7c4",
      explorerUrl: baseSepolia.blockExplorers.default.url,
    }
  ];

  const signIn = async () => {
    try {
      login();
      const config = {
        biconomyPaymasterApiKey: chains[chainSelected].biconomyPaymasterApiKey,
        // Read about this at https://docs.biconomy.io/dashboard#bundler-url
        bundlerUrl: `https://bundler.biconomy.io/api/v2/${chains[chainSelected].chainId}/izhDj8Kmh.401d1ce8-104f-4e86-948d-052430ddd7c4`,
      };

      // IMPORTANT! Choose privy embedded wallet
      const wallet = wallets.find((wallet) => (wallet.walletClientType === 'privy')) as ConnectedWallet;
      setWallet(wallet);
      await wallet.switchChain(chains[chainSelected].chainId);
      const provider = await wallet.getEthersProvider();
      const signer = provider.getSigner();

      const smartAccount = await createSmartAccountClient({
        signer: signer,
        biconomyPaymasterApiKey: config.biconomyPaymasterApiKey,
        bundlerUrl: config.bundlerUrl,
        rpcUrl: chains[chainSelected].providerUrl,
      });

      setSmartAccount(smartAccount);
      console.log("Biconomy Smart Account", smartAccount);
      const smartAccountAddress = await smartAccount.getAddress();
      setSmartAccountAddress(smartAccountAddress)
      console.log("Smart Account Address", smartAccountAddress);
    } catch (error) {
      toast.error("Failed to setup account abstraction");
    }
  };

  const loginOnChain = async () => {
    if (!smartAccount) {
      toast.error("Please connect wallet first")
      return;
    }

    // Change this to any call you want to list of KIP contracts
    const loginInterface = new Interface(['function login(uint256 appId) external']);
    // Login with an random appId
    const encodedData = loginInterface.encodeFunctionData('login', [(Math.random() * (10000000 - 1000 + 1)) << 0]);

    const tx = {
      // Must be in the list of KIP contracts
      // https://sepolia.basescan.org/address/0xd98DaeED0e3562EE43DEdaE98f3fa4e585A9928E#code
      to: "0xd98DaeED0e3562EE43DEdaE98f3fa4e585A9928E",
      value: '0x0',
      data: encodedData,
    };

    // Send transaction to mempool, to be executed by the smart account
    const userOpResponse = await smartAccount.sendTransaction(tx, {
      paymasterServiceData: {mode: PaymasterMode.SPONSORED},
    });

    const { success, receipt } = await userOpResponse.wait();
    if (success === 'true' ) {
      setTxnHash(receipt.transactionHash);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-8 p-24">
      <div className="text-[4rem] font-bold text-orange-400">
        Biconomy-Privy
      </div>

      {/* <div className="text-white">is authenticated: {authenticated ? "True": "False"}</div> */}
      {!smartAccount && (
        <>
          <div className="flex flex-row justify-center items-center gap-4">
            <div
              className={`w-[8rem] h-[3rem] cursor-pointer rounded-lg flex flex-row justify-center items-center text-white ${chainSelected == 0 ? "bg-orange-600" : "bg-black"
                } border-2 border-solid border-orange-400`}
              onClick={() => {
                setChainSelected(0);
              }}
            >
              Base Sepolia
            </div>
          </div>
          <button
            className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
            onClick={signIn}
          >
            Privy Sign in
          </button>
        </>
      )}

      {smartAccount && (
        <>
          <span>Network: {chains[chainSelected].name}</span>
          <span>Privy Wallet Address: {wallet?.address} </span>
          <span>Smart Account Address: {smartAccountAddress} </span>
          <div className="flex flex-row justify-between items-start gap-8">
            <div className="flex flex-col justify-center items-center gap-4">
              <button
                className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                onClick={loginOnChain}
              >
                Login on chain
              </button>
              {txnHash && (
                <a
                  target="_blank"
                  href={`${chains[chainSelected].explorerUrl}/tx/${txnHash}`}
                >
                  <span className="text-white font-bold underline">
                    Txn Hash
                  </span>
                </a>
              )}
            </div>
          </div>
          <span className="text-white">Open console to view console logs.</span>
        </>
      )}
    </main>
  );
}
