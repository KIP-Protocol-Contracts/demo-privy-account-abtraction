import React, { useEffect, useState } from "react";
import {
  createSmartAccountClient,
  BiconomySmartAccountV2,
  PaymasterMode,
  createSessionKeyEOA,
  createSessionSmartAccountClient,
  Hex,
  createSession,
  SessionLocalStorage,
  getSingleSessionTxParams,
  resumeSession,
} from "@biconomy/account";
import { baseSepolia } from "viem/chains";
import { ConnectedWallet, usePrivy, useWallets } from "@privy-io/react-auth";
import { toast } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { Interface } from "ethers/lib/utils";


export default function Home() {
  const [smartAccount, setSmartAccount] =
    useState<BiconomySmartAccountV2 | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>();
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [txnHash, setTxnHash] = useState<string | null>(null);

  const [smartAccountWithSession, setSmartAccountWithSession] = useState<BiconomySmartAccountV2 | null>()
  const [smartAccountWithSessionAddress, setSmartAccountWithSessionAddress] = useState<string | null>()
  const [txHashFromSession, setTxHashFromSession] = useState<string | null>()
  const [chainSelected, setChainSelected] = useState<number>(0);
  const [sessionKeyCreating, setSessionKeyCreating] = useState<boolean>(false)

  const { login, authenticated } = usePrivy();
  const { wallets } = useWallets(); // https://docs.privy.io/guide/react/wallets/use-wallets#usewallets-vs-useprivy

  const chains = [
    {
      ...baseSepolia,
      biconomyPaymasterApiKey: "izhDj8Kmh.401d1ce8-104f-4e86-948d-052430ddd7c4",
      bundlerUrl: `https://bundler.biconomy.io/api/v2/${baseSepolia.id}/izhDj8Kmh.401d1ce8-104f-4e86-948d-052430ddd7c4`,
    }
  ];

  const signIn = async () => {
    try {
      if (!authenticated) login();
      // IMPORTANT! Choose privy embedded wallet
      const wallet = wallets.find((wallet) => (wallet.walletClientType === 'privy')) as ConnectedWallet;
      setWallet(wallet);
      await wallet.switchChain(chains[chainSelected].id);
      const provider = await wallet.getEthersProvider();
      const signer = provider.getSigner();

      const smartAccount = await createSmartAccountClient({
        signer: signer,
        biconomyPaymasterApiKey: chains[chainSelected].biconomyPaymasterApiKey,
        bundlerUrl: chains[chainSelected].bundlerUrl,
        rpcUrl: chains[chainSelected].rpcUrls.default.http[0],
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

  const createSessionKey = async () => {
    try {
      if (!smartAccount || !smartAccountAddress) {
        return;
      }

      setSessionKeyCreating(true)
      const sessionStorage = new SessionLocalStorage(smartAccountAddress as Hex);
      await sessionStorage.clearPendingSessions()
      let session = await resumeSession(sessionStorage);
      if (session.sessionIDInfo.length === 0) {
        //@ts-expect-error
        const sessionKeyAddress = (await (await sessionStorage.addSigner(undefined, chains[chainSelected])).getAddress());
        const { session: newSession, wait } = await createSession(
          smartAccount,
          [
            {
              sessionKeyAddress: sessionKeyAddress as Hex,
              contractAddress: "0xd98daeed0e3562ee43dedae98f3fa4e585a9928e",
              functionSelector: "login(uint256)",
              rules: [],
              interval: {
                validUntil: 0,
                validAfter: 0
              },
              valueLimit: BigInt(0),
            }
          ],
          sessionStorage,
          {
            paymasterServiceData: { mode: PaymasterMode.SPONSORED },
          }
        )

        const { success, receipt } = await wait();
        if (success === 'true') {
          toast.done(`Session key created successfully ${receipt}`)
          session = newSession
          session.sessionStorageClient.updateSessionStatus({ sessionID: session.sessionIDInfo[0] }, "ACTIVE")
        } else {
          toast.error(`Failed to create session key ${receipt}`)
        }
      } else {
        session.sessionStorageClient.updateSessionStatus({ sessionID: session.sessionIDInfo[0] }, "ACTIVE")
      }
      
      const smartAccountWithSession = await createSessionSmartAccountClient(
        {
          accountAddress: smartAccountAddress as Hex, // Dapp can set the account address on behalf of the user
          bundlerUrl: chains[chainSelected].bundlerUrl,
          chainId: chains[chainSelected].id,
        },
        smartAccountAddress as Hex,
      );

      setSmartAccountWithSession(smartAccountWithSession);
      const smartAccountWithSessionAddress = await smartAccountWithSession.getAddress();
      setSmartAccountWithSessionAddress(smartAccountWithSessionAddress)
      setSessionKeyCreating(false)
    } catch (err: any) {
      console.error(err);
    }
  }

  const loginOnChain = async (withSessionKey: boolean = false) => {
    if (!smartAccount || (withSessionKey && !smartAccountWithSession)) {
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

    let userOpResponse
    if (withSessionKey && smartAccountWithSession) {
      const params = await getSingleSessionTxParams(
        smartAccountAddress as Hex,
        chains[chainSelected],
        0,
      )

      console.log("single transaction params", params)

      // send user op
      userOpResponse = await smartAccountWithSession.sendTransaction(tx, {
        ...params,
        paymasterServiceData: { mode: PaymasterMode.SPONSORED },
      });
    } else {
      // Send transaction to mempool, to be executed by the smart account
      userOpResponse = await smartAccount.sendTransaction(tx, {
        paymasterServiceData: { mode: PaymasterMode.SPONSORED },
      });
    }

    const { success, receipt } = await userOpResponse.wait();
    if (success === 'true') {
      if (withSessionKey) {
        setTxHashFromSession(receipt.transactionHash);
      } else {
        setTxnHash(receipt.transactionHash);
      }
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-start gap-8 p-24">
      <div className="text-[4rem] font-bold text-orange-400">
        Biconomy-Privy
      </div>
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
          <span>Session Key Address: {smartAccountWithSessionAddress}</span>
          <div className="flex flex-row justify-between items-start gap-8">
            <div className="flex flex-col justify-center items-center gap-4">
              <button
                className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                onClick={() => loginOnChain(false)}
              >
                Login on chain
              </button>
              {txnHash && (
                <a
                  target="_blank"
                  href={`${chains[chainSelected].blockExplorers.default.url}/tx/${txnHash}`}
                >
                  <span className="text-white font-bold underline">
                    Txn Hash
                  </span>
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-row justify-between items-start gap-8">
            <div className="flex flex-col justify-center items-center gap-4">
              {
                smartAccountWithSession ? (
                  <button
                    className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                    onClick={() => loginOnChain(true)}
                  >
                    Login on chain with Session key
                  </button>
                ) :
                  sessionKeyCreating ? "Creating session key..." : (
                    <button
                      className="w-[10rem] h-[3rem] bg-orange-300 text-black font-bold rounded-lg"
                      onClick={() => createSessionKey()}
                    >
                      Create Session Key
                    </button>
                  )
              }
              {txHashFromSession && (
                <a
                  target="_blank"
                  href={`${chains[chainSelected].blockExplorers.default.url}/tx/${txHashFromSession}`}
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
